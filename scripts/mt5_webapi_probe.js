#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const net = require("node:net");

const WEB_API_VERSION = 5570;
const WEB_API_WORD = "WebAPI";
const CLIENT_COMMAND_MAX = 0x3fff;
const HEADER_LENGTH = 9;
const DEFAULTS = {
  server: "",
  port: 1950,
  login: "",
  account: "100002",
  symbol: "XAUUSD",
  passwordEnv: "MT5_MANAGER_PASSWORD",
  timeoutMs: 10000,
  crypt: "aes",
  agent: "MT5-RISK-PROBE",
  json: false,
};

class Mt5WebApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "Mt5WebApiError";
    Object.assign(this, details);
  }
}

class BufferedSocket {
  constructor(socket, timeoutMs) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.closed = false;
    this.lastError = null;

    socket.on("data", (chunk) => {
      this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
    socket.on("error", (error) => {
      this.lastError = error;
      this.rejectAll(error);
    });
    socket.on("close", () => {
      this.closed = true;
      this.rejectAll(this.lastError || new Error("Socket closed"));
    });
  }

  readExactly(size) {
    if (this.buffer.length >= size) return Promise.resolve(this.consume(size));
    if (this.closed) return Promise.reject(this.lastError || new Error("Socket closed"));

    return new Promise((resolve, reject) => {
      const waiter = {
        size,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          reject(new Error(`Timed out while reading ${size} bytes`));
        }, this.timeoutMs),
      };
      this.waiters.push(waiter);
      this.flush();
    });
  }

  consume(size) {
    const result = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return result;
  }

  flush() {
    while (this.waiters.length > 0 && this.buffer.length >= this.waiters[0].size) {
      const waiter = this.waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(this.consume(waiter.size));
    }
  }

  rejectAll(error) {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

class Mt5PacketCipher {
  constructor(password, cryptRand) {
    if (!Buffer.isBuffer(cryptRand) || cryptRand.length < 16 * 16) {
      throw new Mt5WebApiError("CRYPT_RAND is missing or too short for AES mode", {
        stage: "auth",
      });
    }
    const ivs = deriveAesMaterial(password, cryptRand);
    this.key = Buffer.concat([ivs[0], ivs[1]]);
    this.outState = Buffer.from(ivs[2]);
    this.inState = Buffer.from(ivs[3]);
  }

  encrypt(packetBody) {
    const result = this.transform(packetBody, this.outState);
    this.outState = result.nextState;
    return result.body;
  }

  decrypt(packetBody) {
    const result = this.transform(packetBody, this.inState);
    this.inState = result.nextState;
    return result.body;
  }

  transform(packetBody, initialState) {
    const output = Buffer.alloc(packetBody.length);
    let state = Buffer.from(initialState);
    let keyIndex = 16;

    for (let i = 0; i < packetBody.length; i += 1) {
      if (keyIndex >= 16) {
        state = aesEncryptBlock(this.key, state);
        keyIndex = 0;
      }
      output[i] = packetBody[i] ^ state[keyIndex];
      keyIndex += 1;
    }

    return { body: output, nextState: state };
  }
}

class Mt5WebApiClient {
  constructor(options) {
    this.options = { ...DEFAULTS, ...options };
    this.commandId = 0;
    this.socket = null;
    this.reader = null;
    this.cipher = null;
  }

  async connect() {
    const { server, port, timeoutMs } = this.options;
    this.socket = net.createConnection({ host: server, port });
    this.reader = new BufferedSocket(this.socket, timeoutMs);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Mt5WebApiError(`Timed out connecting to ${server}:${port}`, { stage: "connect" }));
      }, timeoutMs);

      this.socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once("error", (error) => {
        clearTimeout(timer);
        reject(new Mt5WebApiError(`TCP connection failed: ${error.message}`, {
          stage: "connect",
          cause: error,
        }));
      });
    });
  }

  close() {
    if (this.socket) this.socket.destroy();
  }

  async authenticate() {
    const { login, password, crypt, agent } = this.options;
    const cryptMethod = crypt === "none" ? "NONE" : "AES256OFB";
    const authStart = await this.command("AUTH_START", {
      VERSION: String(WEB_API_VERSION),
      AGENT: agent,
      LOGIN: String(login),
      TYPE: "Manager",
      CRYPT_METHOD: cryptMethod,
    }, { first: true, encrypted: false, stage: "auth_start" });

    assertOkRetcode(authStart, "AUTH_START");
    const srvRandHex = authStart.params.SRV_RAND;
    if (!srvRandHex) {
      throw new Mt5WebApiError("AUTH_START did not return SRV_RAND", {
        stage: "auth_start",
        response: authStart.safe,
      });
    }

    const srvRand = Buffer.from(srvRandHex, "hex");
    const cliRand = crypto.randomBytes(16);
    const srvRandAnswer = hashFromPassword(password, srvRand).toString("hex");

    const authAnswer = await this.command("AUTH_ANSWER", {
      SRV_RAND_ANSWER: srvRandAnswer,
      CLI_RAND: cliRand.toString("hex"),
    }, { encrypted: false, stage: "auth_answer" });

    assertOkRetcode(authAnswer, "AUTH_ANSWER");
    if (!authAnswer.params.CLI_RAND_ANSWER) {
      throw new Mt5WebApiError("AUTH_ANSWER did not return CLI_RAND_ANSWER", {
        stage: "auth_answer",
        response: authAnswer.safe,
      });
    }

    if (crypt !== "none") {
      const cryptRandHex = authAnswer.params.CRYPT_RAND;
      if (!cryptRandHex) {
        throw new Mt5WebApiError("AUTH_ANSWER did not return CRYPT_RAND for AES mode", {
          stage: "auth_answer",
          response: authAnswer.safe,
        });
      }
      this.cipher = new Mt5PacketCipher(password, Buffer.from(cryptRandHex, "hex"));
    }

    return {
      ok: true,
      crypt,
      authStart: authStart.safe,
      authAnswer: authAnswer.safe,
    };
  }

  async command(command, params = {}, options = {}) {
    const id = this.nextCommandId();
    const encrypted = options.encrypted !== false && this.cipher;
    const packet = buildPacket(command, params, {
      id,
      first: Boolean(options.first),
      cipher: encrypted ? this.cipher : null,
    });

    await writeAll(this.socket, packet, this.options.timeoutMs);
    const body = await this.readResponse(id, encrypted ? this.cipher : null);
    const text = body.toString("utf16le");
    const parsed = parseProtocolText(text);
    return {
      ...parsed,
      id,
      rawText: text,
      safe: redactSensitiveParsed(parsed),
    };
  }

  async readResponse(expectedId, cipher) {
    const chunks = [];
    while (true) {
      const header = await this.reader.readExactly(HEADER_LENGTH);
      const parsedHeader = parseHeader(header);
      let body = Buffer.alloc(0);
      if (parsedHeader.size > 0) {
        body = await this.reader.readExactly(parsedHeader.size);
        if (cipher) body = cipher.decrypt(body);
      }

      if (parsedHeader.id > CLIENT_COMMAND_MAX || parsedHeader.id !== expectedId) {
        continue;
      }

      chunks.push(body);
      if (parsedHeader.flag === 0) return Buffer.concat(chunks);
    }
  }

  nextCommandId() {
    this.commandId += 1;
    if (this.commandId > CLIENT_COMMAND_MAX) this.commandId = 1;
    return this.commandId;
  }
}

function md5(input) {
  return crypto.createHash("md5").update(input).digest();
}

function hashFromPassword(password, randCode) {
  const passwordHash = md5(Buffer.from(password, "utf16le"));
  const apiHash = md5(Buffer.concat([passwordHash, Buffer.from(WEB_API_WORD, "utf8")]));
  return md5(Buffer.concat([apiHash, randCode]));
}

function deriveAesMaterial(password, cryptRand) {
  let tempRand = md5(Buffer.concat([
    md5(Buffer.from(password, "utf16le")),
    Buffer.from(WEB_API_WORD, "utf8"),
  ]));
  const ivs = [];
  for (let i = 0; i < 16; i += 1) {
    const randPart = cryptRand.subarray(i * 16, i * 16 + 16);
    tempRand = md5(Buffer.concat([randPart, tempRand]));
    ivs.push(tempRand);
  }
  return ivs;
}

function aesEncryptBlock(key, block) {
  const cipher = crypto.createCipheriv("aes-256-ecb", key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function buildQuery(command, params = {}) {
  const entries = Object.entries(params);
  let query = `${command}|`;
  let bodyText = "";

  for (const [key, value] of entries) {
    if (key === "BODY_TEXT") {
      bodyText = value == null ? "" : String(value);
    } else {
      query += `${key}=${quoteValue(value == null ? "" : String(value))}|`;
    }
  }

  return `${query}\r\n${bodyText}`;
}

function quoteValue(value) {
  return value.replace(/[\\=|\n]/g, (char) => `\\${char}`);
}

function unquoteValue(value) {
  let output = "";
  let escaping = false;
  for (const char of value) {
    if (escaping) {
      output += char;
      escaping = false;
    } else if (char === "\\") {
      escaping = true;
    } else {
      output += char;
    }
  }
  if (escaping) output += "\\";
  return output;
}

function buildPacket(command, params, options) {
  const queryBody = Buffer.from(buildQuery(command, params), "utf16le");
  const body = options.cipher ? options.cipher.encrypt(queryBody) : queryBody;
  const header = `${options.first ? "MT5WEBAPI" : ""}${toHex4(body.length)}${toHex4(options.id)}0`;
  return Buffer.concat([Buffer.from(header, "ascii"), body]);
}

function toHex4(value) {
  if (value < 0 || value > 0xffff) {
    throw new RangeError(`Packet value is outside 4-hex range: ${value}`);
  }
  return value.toString(16).padStart(4, "0");
}

function parseHeader(header) {
  const text = header.toString("ascii");
  if (!/^[0-9a-fA-F]{9}$/.test(text)) {
    throw new Mt5WebApiError(`Invalid packet header: ${JSON.stringify(text)}`, {
      stage: "protocol",
    });
  }
  return {
    size: Number.parseInt(text.slice(0, 4), 16),
    id: Number.parseInt(text.slice(4, 8), 16),
    flag: Number.parseInt(text.slice(8, 9), 16),
  };
}

function parseProtocolText(text) {
  const commandEnd = text.indexOf("|");
  if (commandEnd < 0) {
    return {
      command: text.trim(),
      params: {},
      bodyText: "",
      json: null,
      retcode: null,
    };
  }

  const command = text.slice(0, commandEnd);
  const paramsEnd = text.indexOf("\r\n", commandEnd + 1);
  const paramText = text.slice(commandEnd + 1, paramsEnd >= 0 ? paramsEnd : text.length);
  const bodyText = paramsEnd >= 0 ? text.slice(paramsEnd + 2).trim() : "";
  const params = parseParamText(paramText);
  const retcode = parseRetcode(params.RETCODE);
  let json = null;

  if (bodyText) {
    try {
      json = JSON.parse(bodyText);
    } catch {
      json = null;
    }
  }

  return { command, params, bodyText, json, retcode };
}

function parseParamText(paramText) {
  const params = {};
  let key = "";
  let value = "";
  let readingKey = true;
  let escaping = false;

  for (const char of paramText) {
    if (escaping) {
      if (readingKey) key += char;
      else value += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (readingKey && char === "=") {
      readingKey = false;
      continue;
    }
    if (char === "|") {
      if (key) params[key] = value;
      key = "";
      value = "";
      readingKey = true;
      continue;
    }
    if (readingKey) key += char;
    else value += char;
  }

  if (key) params[key] = value;
  return params;
}

function parseRetcode(retcodeText) {
  if (!retcodeText) return null;
  const [codeText, ...messageParts] = retcodeText.split(" ");
  const code = Number.parseInt(codeText, 10);
  return {
    code: Number.isFinite(code) ? code : null,
    message: messageParts.join(" ").trim(),
    raw: retcodeText,
  };
}

function assertOkRetcode(response, command) {
  if (!response.retcode || response.retcode.code !== 0) {
    throw new Mt5WebApiError(`${command} failed: ${response.params.RETCODE || "missing RETCODE"}`, {
      stage: command.toLowerCase(),
      retcode: response.params.RETCODE,
      response: response.safe,
    });
  }
}

function redactSensitiveParsed(parsed) {
  const params = {};
  for (const [key, value] of Object.entries(parsed.params || {})) {
    params[key] = key.includes("RAND") ? summarizeHex(value) : value;
  }
  return {
    command: parsed.command,
    params,
    retcode: parsed.retcode,
    hasJson: parsed.json != null,
    jsonSummary: summarizeJson(parsed.json),
  };
}

function summarizeHex(value) {
  if (!value || value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)} (${value.length / 2} bytes)`;
}

function summarizeJson(json) {
  if (json == null) return null;
  if (Array.isArray(json)) {
    return {
      type: "array",
      count: json.length,
      first: json.length > 0 ? compactObject(json[0]) : null,
    };
  }
  if (typeof json === "object") {
    return {
      type: "object",
      keys: Object.keys(json).slice(0, 20),
      value: compactObject(json),
    };
  }
  return { type: typeof json, value: json };
}

function compactObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const compact = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    compact[key] = item;
  }
  return compact;
}

async function writeAll(socket, packet, timeoutMs) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Mt5WebApiError("Timed out while writing packet", { stage: "protocol" }));
    }, timeoutMs);

    socket.write(packet, (error) => {
      clearTimeout(timer);
      if (error) reject(new Mt5WebApiError(`Socket write failed: ${error.message}`, {
        stage: "protocol",
        cause: error,
      }));
      else resolve();
    });
  });
}

async function probe(options) {
  const client = new Mt5WebApiClient(options);
  const checks = [];
  try {
    await client.connect();
    const auth = await client.authenticate();
    checks.push({ name: "AUTH", ok: true, details: auth });

    checks.push(await safeCommand(client, "TIME_SERVER"));
    checks.push(await safeCommand(client, "USER_GET", { LOGIN: String(options.account) }));
    checks.push(await safeCommand(client, "USER_ACCOUNT_GET", { LOGIN: String(options.account) }));

    const positionTotal = await safeCommand(client, "POSITION_GET_TOTAL", { LOGIN: String(options.account) });
    checks.push(positionTotal);
    const totalPositions = getNumericParam(positionTotal.response, "TOTAL");
    if (totalPositions > 0) {
      checks.push(await safeCommand(client, "POSITION_GET_PAGE", {
        LOGIN: String(options.account),
        OFFSET: "0",
        TOTAL: String(Math.min(totalPositions, 100)),
      }));
    }

    checks.push(await safeCommand(client, "SYMBOL_GET", { SYMBOL: options.symbol }));
    checks.push(await safeCommand(client, "TICK_LAST", { SYMBOL: options.symbol }));

    return {
      ok: true,
      endpoint: `${options.server}:${options.port}`,
      login: String(options.login),
      account: String(options.account),
      symbol: options.symbol,
      crypt: options.crypt,
      checks,
    };
  } finally {
    client.close();
  }
}

async function safeCommand(client, command, params = {}) {
  try {
    const response = await client.command(command, params);
    return {
      name: command,
      ok: !response.retcode || response.retcode.code === 0,
      retcode: response.params.RETCODE || null,
      response: response.safe,
      json: response.json,
    };
  } catch (error) {
    return {
      name: command,
      ok: false,
      error: formatError(error),
    };
  }
}

function getNumericParam(check, name) {
  if (!check || !check.ok || !check.response || !check.response.params) return 0;
  const value = Number(check.response.params[name]);
  return Number.isFinite(value) ? value : 0;
}

function formatError(error) {
  return {
    name: error.name || "Error",
    message: error.message,
    stage: error.stage,
    retcode: error.retcode,
  };
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const equals = arg.indexOf("=");
    const key = (equals >= 0 ? arg.slice(2, equals) : arg.slice(2)).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const inlineValue = equals >= 0 ? arg.slice(equals + 1) : null;

    if (key === "json") {
      options.json = true;
      continue;
    }
    if (key === "help") {
      options.help = true;
      continue;
    }

    const value = inlineValue != null ? inlineValue : argv[++i];
    if (value == null) throw new Error(`Missing value for --${key}`);
    options[key] = value;
  }

  if (String(options.server).includes(":") && !argv.some((arg) => arg === "--port" || arg.startsWith("--port="))) {
    const [host, portText] = String(options.server).split(":");
    options.server = host;
    options.port = Number(portText);
  } else {
    options.port = Number(options.port);
  }
  options.timeoutMs = Number(options.timeoutMs);
  options.crypt = String(options.crypt).toLowerCase();
  if (options.help) return options;
  if (!["aes", "none"].includes(options.crypt)) {
    throw new Error("--crypt must be aes or none");
  }
  if (!options.server) throw new Error("--server is required");
  if (!options.login) throw new Error("--login is required");
  return options;
}

function printHelp() {
  console.log(`MT5 Web API probe

Usage:
  node scripts/mt5_webapi_probe.js --server mt5.example.com --port 1950 --login 1000 --password-env MT5_MANAGER_PASSWORD

Options:
  --server HOST          MT5 server host, required
  --port PORT           MT5 server port, default ${DEFAULTS.port}
  --login LOGIN         Manager login, required
  --account LOGIN       Account to read, default ${DEFAULTS.account}
  --symbol SYMBOL       Symbol to read tick/config, default ${DEFAULTS.symbol}
  --password-env NAME   Environment variable that stores the password
  --timeout-ms MS       Socket timeout, default ${DEFAULTS.timeoutMs}
  --crypt aes|none      Protocol crypt mode, default ${DEFAULTS.crypt}
  --json                Print machine-readable JSON
`);
}

function printReport(result) {
  console.log("MT5 Web API probe result");
  console.log(`Endpoint: ${result.endpoint}`);
  console.log(`Manager login: ${result.login}`);
  console.log(`Account: ${result.account}`);
  console.log(`Symbol: ${result.symbol}`);
  console.log(`Crypt: ${result.crypt}`);
  console.log("");

  for (const check of result.checks) {
    const status = check.ok ? "OK" : "FAILED";
    const retcode = check.retcode ? ` (${check.retcode})` : "";
    console.log(`${status} ${check.name}${retcode}`);
    if (check.error) console.log(`  ${check.error.message}`);
    if (check.response && check.response.jsonSummary) {
      console.log(`  JSON: ${JSON.stringify(check.response.jsonSummary)}`);
    }
    if (check.response && check.response.params && check.response.params.TIME) {
      console.log(`  TIME: ${check.response.params.TIME}`);
    }
    if (check.response && check.response.params && check.response.params.TOTAL) {
      console.log(`  TOTAL: ${check.response.params.TOTAL}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const password = process.env[options.passwordEnv];
  if (!password) {
    const message = `Missing password. Set ${options.passwordEnv} before running this probe.`;
    if (options.json) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else {
      console.error(message);
      console.error("The password is only read from the environment and is never printed.");
    }
    return 2;
  }

  const result = await probe({ ...options, password });
  if (options.json) console.log(JSON.stringify(stripRawJson(result), null, 2));
  else printReport(result);
  return result.ok ? 0 : 1;
}

function stripRawJson(result) {
  return {
    ...result,
    checks: result.checks.map((check) => {
      const { json, ...safeCheck } = check;
      return safeCheck;
    }),
  };
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(formatCliError(error));
    process.exitCode = 1;
  });
}

function formatCliError(error) {
  if (error instanceof Mt5WebApiError) {
    return `${error.message}${error.retcode ? ` (${error.retcode})` : ""}`;
  }
  return error && error.message ? error.message : String(error);
}

module.exports = {
  BufferedSocket,
  Mt5PacketCipher,
  Mt5WebApiClient,
  Mt5WebApiError,
  aesEncryptBlock,
  buildPacket,
  buildQuery,
  deriveAesMaterial,
  hashFromPassword,
  parseArgs,
  parseHeader,
  parseParamText,
  parseProtocolText,
  quoteValue,
  unquoteValue,
};
