# MT5 爆仓风险监控

这个项目是一个独立运行的 Web 系统，用来监控指定 MT5 组客户账号和 LP 账号的持仓风险，计算净值 / 已用预付款低于预设比例时的风险价格，并通过 HTML 邮件或 Telegram Bot 提醒。它不需要做成 MT5 插件或 DLL，也不需要安装在 MT5 服务器上；部署机器只需要能通过网络访问 MT5 Manager API / MT5 Web API 接入层。

## 已实现

- MT5 账号组通配符过滤，例如 `Real\\A*`
- 客户账号持仓、报价、保证金、爆仓价格计算
- 默认美元账号，可按账号/LP 配置杠杆、余额、信用额
- LP 账号风险：支持按客户持仓聚合，也支持显式配置 LP 持仓
- 邮件提醒：HTML 模板、自定义主题、预警条件和模拟触发测试邮件
- Telegram Bot 提醒：自定义消息模板、Chat ID 列表
- 提醒冷却：支持按时间、价格变动点位，或两者组合判断
- 实时价格同步：Web 服务启动后默认自动监控，每 1 秒拉取一次快照并刷新风险结果
- 浏览器实时推送：后端通过 `/api/events` 的 SSE 长连接推送状态、风险和告警结果，浏览器不用自己反复拉取风险接口
- Web API 长连接复用：macOS / Linux Web API 模式可复用已认证 TCP 连接，降低高频刷新时的登录开销
- Mac / Windows 本地测试可使用同一个 Python 启动脚本；生产界面只保留真实 MT5 接入配置
- 已加入 Windows 版 MT5 Manager API SDK 快照采集器源码
- 浏览器控制台：查看风险列表、保存配置、自动实时检测、启动/停止轮询
- Node 内置测试，无第三方 npm 依赖

## 快速运行

```bash
npm run demo
npm run demo:web
npm run demo:mac
npm test
```

默认示例 Web 地址：

```text
http://127.0.0.1:4173
```

Mac / Windows 本地模拟脚本会使用 `2001` 端口并自动打开浏览器：

```bash
python3 mac_local_demo.py
```

Windows CMD / PowerShell 可使用：

```bat
py mac_local_demo.py
```

如果之前的旧服务还占着 `2001` 端口，脚本会拒绝打开旧页面。可以让脚本先停止旧服务再启动当前版本：

```bash
python3 mac_local_demo.py --stop-stale
```

Windows：

```bat
py mac_local_demo.py --stop-stale
```

打开地址：

```text
http://127.0.0.1:2001
```

如果从 macOS IDLE 或双击脚本启动时报 `No such file or directory: 'node'`，说明 Python 进程找不到 Node.js。脚本会自动尝试常见路径，也可以显式指定：

```bash
python3 mac_local_demo.py --node /opt/homebrew/bin/node
```

如果在 Windows 文件夹里看到 `._mac_local_demo.py`、`._README.md` 这类 `._` 开头文件，不要打开它们；这是 macOS 复制文件时生成的元数据文件，不是真正脚本。请运行没有 `._` 前缀的 `mac_local_demo.py`。

Windows 如果找不到 Node.js，`mac_local_demo.py` 和 `deploy_check.py` 会自动尝试启动 Node.js LTS 安装：

- 优先打开 `winget install OpenJS.NodeJS.LTS` 的安装窗口。
- 如果当前 Windows 没有 `winget`，自动打开 https://nodejs.org 下载页。
- 安装完成后需要重新打开 CMD / PowerShell，再运行 `py mac_local_demo.py --stop-stale`。

如果已经安装但脚本仍找不到，也可以显式指定：

```bat
py mac_local_demo.py --node "C:\Program Files\nodejs\node.exe"
```

部署前检查环境：

```bash
npm run deploy:check
```

生成 Linux 生产部署包：

```bash
chmod +x scripts/make_production_package.sh scripts/install_production.sh
scripts/make_production_package.sh
```

部署包会生成到 `dist/`，不会包含 Node.js、`node_modules`、`config.local.json` 或本地密钥。Amazon Linux / CentOS / RHEL / Ubuntu / Debian 一键部署流程见 [docs/amazon-linux-deploy-guide.html](/Users/leo/Documents/爆仓提醒/docs/amazon-linux-deploy-guide.html)。

本地模拟建议复制配置：

```bash
cp examples/config.example.json config.local.json
```

然后修改 `config.local.json`：

- `mt5.servers`: MT5 服务器、端口、Manager Login、密码
- `mt5.groupMasks`: 要监测的组，例如 `["Real\\A*"]`
- `mt5.accountLogins`: 要监测的指定账号，例如 `["100002"]`；为空表示不过滤账号
- `mt5.symbolMasks`: 要监测的产品，默认 `["*"]` 表示全部产品，也可用 `["XAU*", "EURUSD"]`
- `mt5.serverTimeZone`: MT5 服务器时区，支持 `GMT+2` / `GMT+3`，默认夏令时 `GMT+3`
- `mt5.disconnectAfterPollMultiples`: MT5 断联判定倍数，默认 `5`，超过 `价格同步秒数 × 5` 未获取到 MT5 数据才显示断联
- 产品合约量、最小波动点、计算公式、隔夜利息、盈亏币种和保证金币种默认从 MT5 API 自动读取；Web API 可通过 `SYMBOL_TOTAL` / `SYMBOL_NEXT` / `SYMBOL_GET` 获取产品列表和详情
- `runtime.pollIntervalSeconds`: 价格同步秒数，默认 `1`
- `runtime.streamingTransport`: 浏览器推送方式，默认 `sse`
- `runtime.autoStart`: Web 服务启动后是否自动开始价格同步，默认 `true`
- `risk.stopOutLevel`: 爆仓比例，`0.5` 表示 50%
- `risk.accountStopOutLevels`: 单账号爆仓比例覆盖，例如 `{ "1001": 0.45, "LP-USD": 0.3 }`
- `risk.accountOverrides`: 单账号覆盖爆仓比例、预警条件和提醒冷却，优先级高于全局配置
- `risk.alertConditions`: 全局预警条件表达式，支持 `and` / `or` / `not`
- `risk.warningDistancePointsDefault`: 距离爆仓价多少点以内进入“注意”状态，黄色显示
- `risk.dangerDistancePointsDefault` / `risk.alertDistancePointsDefault`: 距离爆仓价多少点以内进入“危险”状态，红色显示
- `risk.warningSymbolDistancePoints` / `risk.dangerSymbolDistancePoints`: 按产品覆盖注意/危险点数，例如 `{ "XAUUSD": 1200 }`
- `risk.symbolMappings`: 产品映射与合约量比例，默认内置 `XAUUSD* -> XAUUSD`、`RKGUSD/RKGCNH/RKGCNY -> XAUUSD`；人民币公斤金可用 `USDCNH` 报价显示 CNH / USD 双价格
- `lpAccount.balance` / `lpAccount.leverage`: LP 账号余额和杠杆
- `email`: SMTP、HTML 模板、测试邮件和邮件预警条件配置
- `telegram`: Telegram Bot Token、Chat ID 和消息模板
- `notifications.cooldown`: 全局提醒冷却规则，`mode` 可用 `timeOnly`、`priceOnly`、`timeOrPrice`、`timeAndPrice`；冷却规则独立配置，不写在单条预警条件里

## MT5 密码配置

后台 `Configuration -> MT5` 中可以直接填写 Manager 密码。保存后 UI 只显示隐藏占位，不回显明文。生产环境也可以继续使用环境变量注入密码，但不要把真实密码提交到公开仓库。

## Telegram Bot 配置

Telegram Bot 在后台 `Configuration -> Email/Telegram` 中配置。Token 保存后 UI 会隐藏；Chat ID 可按页面提示通过 `getUpdates` 获取，也可以手动填写个人、群组或频道 ID。生产环境不要把 Bot Token 写入公开仓库。

## MT5 Manager API

当前目录已包含 `MetaTrader5SDK`，其中有 Manager API 头文件、Windows DLL 和 .NET Framework wrapper。系统新增了一个 Windows SDK 快照采集器：[adapters/MT5ManagerSnapshot](/Users/leo/Documents/爆仓提醒/adapters/MT5ManagerSnapshot)。

- Windows 独立部署：构建 `MT5ManagerSnapshot.exe`，Node 主系统通过 `provider.type = "managerApi"` 调用它读取真实快照；这不是 MT5 服务器插件，不需要安装到 MT5 服务器。
- Linux 独立部署：需要在部署环境提供可用的 MT5 API 接入客户端或服务端适配层。
- macOS：不能直接加载官方 Manager API DLL，但可以先用 SDK Web API 协议探针测试服务器是否开放 Web API。探针成功后，可以继续做 macOS / Linux 直连 provider。

Windows 真实配置可从这个文件开始：

```bash
cp examples/config.manager-api.example.json config.local.json
```

然后在运行环境设置：

```bash
export MT5_MANAGER_PASSWORD='your-password'
```

快照采集器会返回 `serverTime / accounts / positions / symbols / quotes`，系统会在本地完成组过滤、保证金估算、爆仓价搜索、LP 风险计算和邮件提醒。

真正的 MT5 服务端推送式实时动态需要 Manager API 的订阅能力，例如 `TickSubscribe`、`PositionSubscribe`、`DealSubscribe`、`UserAccountSubscribe`。这需要在 Windows 上运行独立 adapter 服务，再用 WebSocket/SSE 把事件推给本系统；不需要安装到 MT5 服务器。

接口和字段建议见 [docs/mt5-manager-api-integration.md](/Users/leo/Documents/爆仓提醒/docs/mt5-manager-api-integration.md)。

## MT5 Web API 探针

SDK 里的 `Examples/Web/NET/MetaQuotes.MT5WebAPI` 使用 TCP 协议连接 MT5 服务器，不依赖 Windows DLL。本项目已加入 Node 版探针：[scripts/mt5_webapi_probe.js](/Users/leo/Documents/爆仓提醒/scripts/mt5_webapi_probe.js)。

macOS / Linux：

```bash
export MT5_MANAGER_PASSWORD='your-password'
npm run probe:webapi -- --server mt5.example.com --port 1950 --login 1000 --account 100002 --symbol XAUUSD
```

Windows PowerShell：

```powershell
$env:MT5_MANAGER_PASSWORD="your-password"
npm run probe:webapi -- --server mt5.example.com --port 1950 --login 1000 --account 100002 --symbol XAUUSD
```

探针不会内置真实服务器地址或账号；请通过 `--server`、`--port`、`--login` 指定 MT5 Web API 入口。密码只从 `MT5_MANAGER_PASSWORD` 环境变量读取，不会写入配置或打印出来。默认使用 SDK 的 `AES256OFB` 加密模式；如果需要排查服务器是否只接受明文协议，可以追加：

```bash
npm run probe:webapi -- --server mt5.example.com --port 1950 --login 1000 --crypt none --account 100002 --symbol XAUUSD
```

结果判断：

- `AUTH / TIME_SERVER / USER_ACCOUNT_GET / POSITION_GET_TOTAL / TICK_LAST` 都返回 `OK`：说明当前机器可以不经过 Windows DLL 直接访问 MT5 Web API。
- TCP 连接失败：检查服务器端口、防火墙、IP 白名单。
- `AUTH_START` 或 `AUTH_ANSWER` 失败：检查 Manager 账号密码、账号权限、服务器是否启用 Web API Manager 访问。
- 登录成功但读取账号/持仓/报价失败：检查 Manager 权限是否允许读取用户、持仓、产品和报价。

探针成功后，Mac / Linux 可以把系统数据源切到 `mt5WebApi`：

```bash
cp examples/config.web-api.example.json config.local.json
export MT5_MANAGER_PASSWORD='your-password'
npm run web
```

也可以在浏览器的 `Configuration -> MT5 -> 接入方式` 选择 `MT5 Web API` 后保存配置。Mac 下不要选择 `Manager API`，那个路径会检查 Windows DLL 适配器。

注意：MT5 Web API SDK 暴露的是请求/响应命令，例如 `TICK_LAST`、`TICK_LAST_GROUP`、`USER_ACCOUNT_GET`、`POSITION_GET_PAGE`，没有 tick/position/account 的订阅命令。它可以复用长 TCP 连接做高频刷新，但不是真正的服务器推送。如果 `aes` 和 `none` 都报 `ECONNRESET`，说明该端口大概率不是 Web API 入口，或服务器未开放 Web API Manager 登录、IP 白名单或权限。

## Web 部署

Windows 或 Linux 均可运行：

```bash
npm run web
```

如需局域网访问，把 `config.local.json` 的 `web.host` 改为 `0.0.0.0`，并设置防火墙只允许可信来源。公网或多人访问时建议设置：

```json
{
  "web": {
    "host": "0.0.0.0",
    "port": 4173,
    "auth": {
      "enabled": true,
      "secureCookie": "auto"
    }
  }
}
```

首次部署可运行 `npm run setup:remote-login` 生成后台 admin 用户。浏览器访问 `http://服务器IP:4173` 即可打开登录页；如使用域名，将域名反向代理到同一个端口即可。

Cloudflare 接入建议：

- DNS 记录指向服务器公网 IP，开启 Proxied。
- 或使用 Cloudflare Tunnel，把公网域名转发到 `http://127.0.0.1:4173`。
- Cloudflare SSL/TLS 选择 Full 或 Full strict；系统会根据 `X-Forwarded-Proto: https` 自动给登录 Cookie 加 `Secure`。
- 源站防火墙尽量只允许 Cloudflare IP 或内网管理 IP 访问 Web 端口。
