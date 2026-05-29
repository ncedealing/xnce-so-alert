# 生产环境技术栈建议

## 推荐方案

正式生产建议使用：

- 后端：.NET 8 / .NET 9 ASP.NET Core
- 后台任务：.NET Worker Service / BackgroundService
- 实时推送：SignalR WebSocket，必要时降级 SSE
- MT5 接入：Windows 独立进程内直接调用 MT5 Manager API SDK DLL
- 前端：React + Vite + TypeScript
- 数据库：SQLite WAL 单机部署；需要审计、历史报表或多实例时切 PostgreSQL
- 反向代理：Caddy 或 Nginx，必须启用 HTTPS
- 运行方式：Windows Service；如果只使用 MT5 Web API，可部署到 Linux systemd

## 为什么优先 .NET

MT5 Manager API SDK 的核心约束是 Windows DLL。生产环境如果要读取账号、持仓、报价、产品详情、实时杠杆和预付款状态，.NET 对 Windows DLL、后台任务、长连接、权限控制和服务化部署的支持最稳，开发复杂度也低。

Go 的资源占用更低，但直接对接 MT5 Manager SDK DLL 的工程成本和风险更高；只有在券商确认开放 MT5 Web API，并且不依赖 Windows Manager DLL 时，Go 才适合作为 Linux 后端。

Node.js 适合作为当前 Web demo、UI 联调和轻量服务；如果进入严肃生产，建议把 MT5 接入和风控计算迁移到 .NET 服务，前端 React 可以继续复用。

## Python 定位

Python 只用于 Mac 本地测试脚本，例如启动本地 demo、自动打开浏览器或生成测试环境。生产部署、登录初始化、服务运行和 MT5 接入不依赖 Python。
