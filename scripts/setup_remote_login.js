#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG = path.join(ROOT, 'config.local.json');
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function parseArgs(argv) {
  const args = { config: DEFAULT_CONFIG, username: '', password: '', reset: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') {
      args.config = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--username') {
      args.username = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--password') {
      args.password = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--reset') {
      args.reset = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/setup_remote_login.js [options]

Options:
  --config <file>      Config file, default: config.local.json
  --username <name>    Admin username. Random secure username if omitted.
  --password <value>   Admin password. Random strong password if omitted.
  --reset              Replace existing users with this admin user.
`);
}

function loadConfig(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function randomUsername() {
  return `admin_${randomString('abcdefghijklmnopqrstuvwxyz0123456789', 12)}`;
}

function randomPassword() {
  const chars = [
    randomString('abcdefghijklmnopqrstuvwxyz', 1),
    randomString('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1),
    randomString('0123456789', 1),
    randomString('!@#$%^&*()-_=+', 1)
  ];
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+';
  for (let index = 0; index < 18; index += 1) chars.push(randomString(alphabet, 1));
  return shuffle(chars).join('');
}

function randomString(alphabet, length) {
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return result;
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function validateUsername(username) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{7,31}$/.test(username)) {
    throw new Error('用户名需以字母开头，长度 8-32，只能包含字母、数字、下划线和中划线');
  }
}

function validatePassword(password) {
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error('密码至少 12 位，并包含大写字母、小写字母、数字和符号');
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p
  });
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt}:${key.toString('base64')}`;
}

function main() {
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args.config);
  const config = loadConfig(configPath);
  const username = args.username || randomUsername();
  const password = args.password || randomPassword();
  validateUsername(username);
  validatePassword(password);

  config.web = config.web || {};
  config.web.auth = config.web.auth || {};
  config.web.auth.enabled = true;
  config.web.auth.cookieName = config.web.auth.cookieName || 'mt5_risk_session';
  config.web.auth.sessionTtlHours = config.web.auth.sessionTtlHours || 12;
  const users = args.reset ? [] : [...(config.web.auth.users || [])];
  if (users.some((user) => user.username === username)) {
    throw new Error(`用户已存在: ${username}。如需重置请使用 --reset。`);
  }
  users.push({
    username,
    role: 'admin',
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  });
  config.web.auth.users = users;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  console.log('远程登录已启用。请妥善保存以下初始账号，密码只显示这一次：');
  console.log(`  URL:      http://<服务器IP>:${config.web.port || 4173}`);
  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}`);
  console.log(`  Config:   ${configPath}`);
  console.log('\n启动或重启服务后生效：');
  console.log('  npm run web');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
