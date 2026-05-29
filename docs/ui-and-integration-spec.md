# MT5 爆仓风险监控系统功能列表与技术规范

## 1. 系统定位

这是一个独立运行的 Web 系统，用于监控 MT5 指定客户组账号和 LP 账号的持仓风险，计算可能触发爆仓的价格，并在价格距离爆仓价格达到预设点数时发送邮件或 Telegram 提醒。

系统不需要安装在 MT5 服务器上，也不做 MT5 插件或 DLL。部署机器可以是 Windows 或 Linux，只需要能够通过网络访问 MT5 Manager API 或 MT5 Web API 适配层。

## 2. 核心功能列表

### 2.1 账号与组监控

- 配置一个或多个 MT5 服务器信息。
- 配置 Manager Login、密码、连接超时。
- 配置需要监控的 MT5 账号组。
- 账号组支持通配符，例如：
  - `Real\A*`
  - `Real\B*`
  - `Demo\VIP?`
- 系统按组拉取客户账号、持仓订单、交易产品信息和实时 Bid/Ask。

### 2.2 持仓与行情监控

- 获取客户当前持仓。
- 获取持仓产品的实时买价和卖价。
- 展示账号、组、余额、净值、已用预付款、预付款比例、持仓产品、方向、爆仓价格、距离点数。
- 支持手动刷新检测。
- 支持后台价格同步检测，默认启动后自动运行，每 1 秒同步一次。
- 支持显示检测账号数、持仓订单数、触发提醒数。

### 2.3 保证金与爆仓价计算

- 默认账号货币为 USD。
- 可配置爆仓比例，默认 `0.5`，表示净值 / 已用预付款低于 50% 触发风险。
- 根据账号余额、信用额、持仓盈亏、持仓保证金计算当前风险状态。
- 根据持仓方向搜索风险价格：
  - 净多头：价格下跌方向搜索爆仓价。
  - 净空头：价格上涨方向搜索爆仓价。
  - 多空基本对冲：可同时计算上涨和下跌方向。
- 支持按产品配置不同预警距离点数。
- 支持产品映射和乘数配置，例如 `RKGCNH -> XAUUSD`：
  - `mappedLotsPerBaseLot=3.11035` 表示 1 手 XAUUSD 等于 3.11035 手 RKGCNH。
  - 系统内部会把 RKGCNH 折算为 XAUUSD 等价手数，与同方向 XAUUSD 持仓合并计算。
  - 爆仓价可同时展示 XAUUSD 美元价格和 RKGCNH CNH 价格。
  - `USDCNH` 报价由 Manager API 适配层提供，用于 CNH 与 USD 价格换算。

### 2.4 LP 账号风险计算

- 输入 LP 账号余额。
- 输入 LP 账号杠杆。
- 默认 LP 账号货币为 USD。
- 支持根据客户持仓自动聚合 LP 敞口。
- 支持 LP 敞口方向：
  - `same`: LP 与客户持仓同向聚合。
  - `opposite`: LP 与客户持仓反向聚合。
- 支持未来扩展为手动输入 LP 显式持仓。
- 独立展示 LP 账号的爆仓价格和预警距离。

### 2.5 邮件提醒

- 内置邮件提醒。
- 内置 Telegram Bot 提醒。
- 支持 SMTP。
- 支持自定义 HTML 邮件模板。
- 支持自定义邮件主题模板。
- 支持收件人列表。
- 支持模拟爆仓触发并发送测试邮件，不依赖真实告警触发。
- 支持提醒冷却期，避免同一账号、同一产品、同一方向频繁发送。
- 冷却期可按时间、价格变动点位，或两者组合判断。
- 触发条件：
  - 客户账号或 LP 账号的某个持仓产品当前价格距离爆仓价格小于等于配置点数。

### 2.6 配置管理

- Web 页面可查看和保存配置。
- 可配置：
  - MT5 服务器地址、端口、Manager Login、密码。
  - MT5 服务器连接状态测试。
  - MT5 服务器时区，支持 GMT+2 / GMT+3，默认夏令时 GMT+3。
  - 监控组通配符。
  - 价格同步秒数，默认每 1 秒同步一次。
  - MT5 断联判定倍数，默认 5；超过 `价格同步秒数 × 倍数` 未获取到 MT5 数据才显示 `MT5断联`。
  - 启动后自动同步价格，默认开启。
  - 爆仓比例。
  - 按账号单独覆盖爆仓比例。
  - 默认预警点数。
  - 按产品预警点数。
  - LP 账号余额、杠杆、敞口方向。
  - 邮件启用状态、SMTP 参数、Telegram Bot、冷却期。

### 2.7 权限与访问

- Web 系统支持本地访问。
- 可配置访问 Token 环境变量。
- 如果设置 `web.authTokenEnv`，API 请求需要携带：

```http
Authorization: Bearer <token>
```

## 3. 推荐 UI 页面结构

### 3.1 Dashboard

第一屏直接展示运营工作台，不做营销首页。

推荐区域：

- 顶部导航：
  - `Dashboard`
  - `Configuration`
- 顶部工具栏：
  - 页面标题
  - 自动检测状态
  - 启动/停止轮询按钮
- 指标卡片：
  - 监测账号数
  - 持仓订单数
  - 触发提醒数
- 风险表格：
  - 账号
  - 组
  - 净值
  - 已用预付款
  - 预付款比例
  - 产品（每个账号下所有符合筛选条件的产品逐行展示）
  - 净头寸方向
  - 净手数 / 总手数
  - 合约单位
  - 每点价值
  - 爆仓价格
  - 距离点数
  - 提醒阈值
  - 风险等级
- 提醒队列：
  - 本次触发的提醒
  - 账号
  - 产品
  - 方向
  - 距离点数
  - 邮件主题

### 3.2 Configuration

`Dashboard` 和 `Configuration` 是两个独立主面板。`Configuration` 内部使用子标签页组织配置项。

#### 3.2.1 MT5 子标签

包含以下配置分区：

- `MT5 Manager Account Configuration`
  - MT5 服务器地址
  - MT5 端口
  - Manager Login
  - Manager 密码
  - 连接测试按钮：测试 MT5 服务器端口可达性，并在 Dashboard 右上角显示连接状态
  - 价格同步秒数
  - MT5 断联判定倍数
  - 服务器时区，支持 `GMT+2` 冬令时和 `GMT+3` 夏令时，默认 `GMT+3`
  - 服务器时间显示：只有读取到 MT5 快照里的 `serverTime` 才更新；未读取到时保持上一次成功读取的时间
- `Group Filter`
  - 监测组通配符，多个值用逗号分隔
  - 示例：`Real\A*, Real\B*`
- `LP Account`
  - 是否启用 LP 风险监控
  - LP 名称、余额、杠杆和聚合方向

#### 3.2.2 Symbol List 子标签

- `Symbol Filter`
  - 监测产品通配符，多个值用逗号分隔，默认 `*`
  - 示例：`XAU*, EURUSD, GBPUSD`
- `Product Specifications`
  - 从 MT5 API 同步产品列表和详情
  - 包含产品、路径/描述、合约量、最小波动点、计算公式、Swap Long、Swap Short、盈亏币种、保证金币种
  - 不需要手动上传产品列表；旧配置里的 `mt5.symbolSpecs` 只能作为缺失字段兜底，不能覆盖 Manager API 返回值

#### 3.2.3 Symbol Mapping 子标签

- `Symbol Mapping`
  - 产品映射页面内表格
  - 基准产品，例如 `XAUUSD`
  - 映射产品，例如 `RKGCNH`
  - 手数乘数，例如 `mappedLotsPerBaseLot=3.11035`
  - 汇率产品，例如 `USDCNH`
  - 价格乘数，例如 `baseToMappedPriceMultiplier=32.15074657`

#### 3.2.4 Alert Condition 子标签

- `Alert Thresholds`
  - 爆仓比例
  - 按账号覆盖爆仓比例，例如 `1001:45%, LP-USD:30%`
  - 默认注意点数，黄色显示
  - 默认危险点数，红色显示
  - 按产品覆盖注意/危险点数，例如 `XAUUSD:1200, EURUSD:500`
- `Global Alert Conditions`
  - 全局预警条件表达式
  - 支持 `and` / `or` / `not`
  - 支持距离点数、预付款比例、总手数、净手数等指标

#### 3.2.5 Email/Telegram 子标签

包含以下配置分区：

- `Email server configuration`
  - 是否启用邮件
  - SMTP Host
  - SMTP Port
  - From
  - To
  - 测试邮件按钮：保存当前配置后，用模拟爆仓上下文渲染 HTML 模板并发送测试邮件
- `Email Template`
  - HTML 模板路径
  - 邮件主题模板
- `Telegram Bot Configuration`
  - UI 内提供 BotFather、Chat ID、保存启用的操作提示
  - Bot Token 支持环境变量和临时明文输入，保存后隐藏展示
- `Notification Cooldown`
  - 支持按时间、价格变动点位，或两者组合判断
- `Telegram Bot Configuration`
  - 是否启用 Telegram
  - Bot Token 环境变量或明文 Token
  - Chat IDs，多个值用逗号分隔
  - Parse Mode：`HTML` / `MarkdownV2` / 空
  - Telegram 消息模板
- `Notification Cooldown`
  - 冷却秒数
  - 价格变动点位
  - 冷却模式：仅时间 / 仅价格点位 / 时间或价格满足其一 / 时间和价格同时满足

配置表单需要有清晰保存按钮，保存成功后显示状态反馈。

### 3.3 推荐视觉风格

- SaaS / 风控后台风格。
- 信息密度中等偏高，适合运营人员反复查看。
- 避免营销式 hero。
- 避免大量装饰卡片。
- 表格优先，卡片用于关键指标。
- 前端不允许内置示例账号、示例持仓或 mock 风险数据；所有 Dashboard 数据必须来自 `/api/status` 和 `/api/risk`。
- 账号详情面板建议接近全屏，从右侧向左滑入，展示产品净头寸和持仓订单明细。
- 视觉风格需要贴近 Gemini demo：`bg-zinc-950` 全屏暗色工作台、顶部品牌栏、Dashboard/Configuration 顶部导航、zinc 深色表格面板、emerald 作为运行/选中主色，红色用于高危告警。
- 风险颜色：
  - 正常：绿色
  - 接近风险：橙色
  - 触发提醒：红色

## 4. 前端 API 合约

默认本地地址：

```text
http://127.0.0.1:2001
```

### 4.1 获取系统状态

```http
GET /api/status
```

响应：

```json
{
  "running": true,
  "pollInFlight": false,
  "pollIntervalSeconds": 1,
  "mt5DisconnectAfterPollMultiples": 5,
  "serverTimeStaleThresholdMs": 5000,
  "mt5Connection": {
    "status": "connected",
    "ok": true,
    "latencyMs": 28
  },
  "serverTime": "2026-05-28T06:00:00.000Z",
  "serverTimeUpdatedAt": "2026-05-28T06:00:03.000Z",
  "serverTimeStale": false,
  "serverTimeZone": "GMT+3",
  "groupMasks": ["Real\\A*"],
  "symbolMasks": ["*"],
  "lastCheckedAt": "2026-05-28T06:00:00.000Z",
  "lastError": null,
  "accounts": 1,
  "positions": 2,
  "alerts": 0
}
```

### 4.2 获取配置

```http
GET /api/config
```

响应为完整配置对象，见第 6 节。

### 4.3 保存配置

```http
PUT /api/config
Content-Type: application/json
```

请求体为完整配置对象。

响应：

```json
{
  "ok": true,
  "config": {}
}
```

### 4.4 自动检测

```http
POST /api/check
```

响应：

```json
{
  "checkedAt": "2026-05-28T06:00:00.000Z",
  "snapshot": {},
  "reports": [],
  "alerts": []
}
```

### 4.5 启动轮询

```http
POST /api/monitor/start
```

响应同 `/api/status`。

### 4.6 停止轮询

```http
POST /api/monitor/stop
```

响应同 `/api/status`。

### 4.7 获取最近一次风险结果

```http
GET /api/risk
```

如果尚未检测，返回 `null`。

## 5. 风险结果数据结构

### 5.1 Risk Result

```json
{
  "checkedAt": "2026-05-28T06:00:00.000Z",
  "snapshot": {
    "serverTime": "2026-05-28T06:00:00.000Z",
    "accounts": [],
    "positions": [],
    "symbols": [],
    "quotes": []
  },
  "reports": [
    {
      "account": {
        "login": 1001,
        "group": "Real\\A1",
        "currency": "USD",
        "balance": 2000,
        "credit": 0,
        "leverage": 100,
        "equity": 1700,
        "margin": 1085.2
      },
      "positions": [],
      "positionDetails": [
        {
          "ticket": 70001,
          "symbol": "EURUSD",
          "action": "BUY",
          "volumeLots": 1,
          "openPrice": 1.088,
          "closePrice": 1.085,
          "contractSize": 100000,
          "point": 0.00001,
          "pointValue": 1,
          "pointValueAccount": 1,
          "profitCurrency": "USD",
          "profit": -300
        }
      ],
      "symbolExposures": [
        {
          "symbol": "EURUSD",
          "buyLots": 1,
          "sellLots": 0,
          "grossLots": 1,
          "netLots": 1,
          "absNetLots": 1,
          "netDirection": "BUY",
          "adverseDirection": "down",
          "contractSize": 100000,
          "grossContractUnits": 100000,
          "netContractUnits": 100000,
          "point": 0.00001,
          "pointValuePerLot": 1,
          "pointValuePerLotAccount": 1,
          "profitCurrency": "USD",
          "profit": -300,
          "risk": {}
        }
      ],
      "dashboardExposure": {
        "symbol": "EURUSD",
        "grossLots": 1,
        "netLots": 1,
        "netDirection": "BUY",
        "contractSize": 100000,
        "netContractUnits": 100000,
        "pointValuePerLotAccount": 1,
        "risk": {}
      },
      "equity": 1700,
      "margin": 1085.2,
      "floating": -300,
      "marginLevel": 1.5665,
      "stopOutLevel": 0.5,
      "symbolRisks": [
        {
          "symbol": "EURUSD",
          "direction": "down",
          "currentPrice": 1.085,
          "liquidationPrice": 1.07573,
          "distancePoints": 927,
          "alertDistancePoints": 500,
          "shouldAlert": false,
          "stopOutLevel": 0.5,
          "point": 0.00001,
          "grossLots": 1,
          "netLots": 1,
          "convertedPrices": [
            {
              "symbol": "XAUUSD",
              "currentPrice": 2352.1,
              "liquidationPrice": 2300.1,
              "distancePoints": 5200
            },
            {
              "symbol": "RKGCNH",
              "currentPrice": 544400,
              "liquidationPrice": 532370,
              "distancePoints": 12030
            }
          ],
          "quote": {
            "symbol": "EURUSD",
            "bid": 1.085,
            "ask": 1.0852,
            "time": "2026-05-28T06:00:00.000Z"
          }
        }
      ]
    }
  ],
  "alerts": [
    {
      "key": "1001:EURUSD:down:0.5",
      "subject": "[爆仓预警] 1001 EURUSD 距离 300 点",
      "account": {},
      "risk": {}
    }
  ]
}
```

## 6. 配置对象结构

```json
{
  "runtime": {
    "pollIntervalSeconds": 1,
    "autoStart": true,
    "stateDir": ".state",
    "logLevel": "info"
  },
  "web": {
    "host": "127.0.0.1",
    "port": 2001,
    "authTokenEnv": ""
  },
  "provider": {
    "type": "mock",
    "mockSnapshotPath": "examples/mock-snapshot.json",
    "managerApi": {
      "command": "adapters/MT5ManagerSnapshot/bin/Release64/MT5ManagerSnapshot.exe",
      "args": [],
      "timeoutMs": 30000
    }
  },
  "mt5": {
    "servers": [
      {
        "name": "primary",
        "host": "mt5.example.com",
        "port": 443,
        "login": 1000,
        "passwordEnv": "MT5_MANAGER_PASSWORD",
        "timeoutMs": 15000
      }
    ],
    "groupMasks": ["Real\\A*"],
    "symbolMasks": ["*"],
    "baseCurrency": "USD",
    "serverTimeZone": "GMT+3",
    "disconnectAfterPollMultiples": 5
  },
  "risk": {
    "stopOutLevel": 0.5,
    "accountStopOutLevels": {
      "1001": 0.45,
      "LP-USD": 0.3
    },
    "accountOverrides": {
      "1001": {
        "stopOutLevel": 0.45,
        "alertConditions": {
          "op": "or",
          "rules": [
            { "metric": "distancePoints", "operator": "lte", "value": 500 },
            { "metric": "marginLevel", "operator": "lte", "value": 0.8 }
          ]
        },
        "cooldown": {
          "seconds": 0,
          "priceMovementPoints": 30,
          "mode": "priceOnly"
        }
      }
    },
    "alertConditions": {
      "op": "or",
      "rules": [
        { "metric": "distancePoints", "operator": "lte", "value": 500 },
        { "metric": "marginLevel", "operator": "lte", "value": 0.8 },
        { "metric": "grossLots", "operator": "gte", "value": 5 }
      ]
    },
    "alertDistancePointsDefault": 500,
    "symbolDistancePoints": {
      "XAUUSD": 1200
    },
    "symbolMappings": {
      "XAUUSD*": {
        "baseSymbol": "XAUUSD",
        "mappedLotsPerBaseLot": 1,
        "currency": "USD"
      },
      "RKGCNH": {
        "baseSymbol": "XAUUSD",
        "mappedLotsPerBaseLot": 3.11035,
        "fxSymbol": "USDCNH",
        "baseToMappedPriceMultiplier": 32.15074657,
        "currency": "CNH"
      }
    },
    "maxSearchDistancePoints": 200000,
    "treatReportedMarginAsFixed": false,
    "includeCreditInEquity": true,
    "minimumMargin": 0.01
  },
  "notifications": {
    "cooldown": {
      "seconds": 1800,
      "priceMovementPoints": 200,
      "mode": "timeOrPrice"
    }
  },
  "lpAccount": {
    "enabled": true,
    "name": "LP-USD",
    "balance": 5000,
    "credit": 0,
    "leverage": 100,
    "currency": "USD",
    "mode": "aggregateClientExposure",
    "hedgeDirection": "same",
    "aggregation": "net",
    "explicitPositions": []
  },
  "email": {
    "enabled": false,
    "transport": "console",
    "templatePath": "templates/liquidation-alert.html",
    "cooldownSeconds": 1800,
    "subjectTemplate": "[爆仓预警] {{account.login}} {{risk.symbol}} 距离 {{risk.distancePoints}} 点",
    "alertConditions": {
      "accountScope": "all",
      "triggerMode": "any",
      "distanceToLiquidation": true,
      "marginLevel": {
        "enabled": false,
        "threshold": 0.8
      },
      "stopOut": {
        "enabled": true
      }
    },
    "smtp": {
      "host": "smtp.example.com",
      "port": 587,
      "secure": false,
      "usernameEnv": "SMTP_USER",
      "passwordEnv": "SMTP_PASSWORD",
      "from": "risk@example.com",
      "to": ["risk@example.com"],
      "timeoutMs": 10000
    }
  },
  "telegram": {
    "enabled": false,
    "botTokenEnv": "TELEGRAM_BOT_TOKEN",
    "botToken": "",
    "chatIds": ["-1001234567890"],
    "parseMode": "HTML",
    "disableWebPagePreview": true,
    "timeoutMs": 10000,
    "messageTemplate": "<b>爆仓风险预警</b>\n账号: {{account.login}}\n产品: {{risk.symbol}}\n距离: {{risk.distancePoints}} 点"
  }
}
```

## 7. MT5 Manager API 对接规范

### 7.1 接入模式

系统前端不暴露接入层类型选项。生产环境建议在后端实现 MT5 Manager API 适配层，输出统一快照结构：

- `mock`: 本地开发和演示使用 JSON 文件模拟。
- `managerApi`: 生产环境通过 MT5 Manager API 或 MT5 Web API 读取账号、持仓、产品和报价。

Windows 独立部署可以直接接 Manager API 客户端库。Linux 部署需要可用的 MT5 Web API 或等价的服务端适配层。

### 7.2 Snapshot API

```http
GET /snapshot?groups=Real%5CA*&groups=Real%5CB*&symbols=*
Authorization: Bearer <optional-api-key>
```

响应：

```json
{
  "serverTime": "2026-05-28T06:00:00.000Z",
  "accounts": [
    {
      "login": 1001,
      "group": "Real\\A1",
      "currency": "USD",
      "balance": 2000,
      "credit": 0,
      "leverage": 100,
      "equity": 1700,
      "margin": 1085.2
    }
  ],
  "positions": [
    {
      "login": 1001,
      "ticket": 70001,
      "symbol": "EURUSD",
      "action": "BUY",
      "volumeLots": 1,
      "openPrice": 1.088,
      "swap": 0,
      "commission": 0
    }
  ],
  "symbols": [
    {
      "symbol": "EURUSD",
      "digits": 5,
      "point": 0.00001,
      "contractSize": 100000,
      "currencyProfit": "USD",
      "currencyMargin": "USD"
    }
  ],
  "quotes": [
    {
      "symbol": "EURUSD",
      "bid": 1.085,
      "ask": 1.0852,
      "time": "2026-05-28T06:00:00.000Z"
    }
  ]
}
```

### 7.3 字段要求

#### Account

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `login` | number/string | 是 | MT5 登录账号 |
| `group` | string | 是 | MT5 账号组 |
| `currency` | string | 否 | 默认 USD |
| `balance` | number | 是 | 余额 |
| `credit` | number | 否 | 信用额 |
| `leverage` | number | 是 | 杠杆 |
| `equity` | number | 建议 | MT5 当前净值 |
| `margin` | number | 建议 | MT5 当前已用保证金 |

#### Position

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `login` | number/string | 是 | 账号 |
| `ticket` | number/string | 是 | 持仓票号 |
| `symbol` | string | 是 | 产品 |
| `action` | string | 是 | `BUY` 或 `SELL` |
| `volumeLots` | number | 是 | 手数 |
| `openPrice` | number | 是 | 开仓价 |
| `swap` | number | 否 | 库存费 |
| `commission` | number | 否 | 手续费 |
| `margin` | number | 否 | 如果接入层已计算单笔保证金，可传入 |

#### Symbol

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `symbol` | string | 是 | 产品 |
| `digits` | number | 建议 | 报价精度 |
| `point` | number | 建议 | 最小点值 |
| `contractSize` | number | 是 | 合约大小 |
| `currencyProfit` | string | 否 | 盈亏货币 |
| `currencyMargin` | string | 否 | 保证金币种 |
| `marginInitial` | number | 否 | 固定初始保证金 |
| `marginLong` | number | 否 | 多头保证金系数 |
| `marginShort` | number | 否 | 空头保证金系数 |
| `marginRateInitial` | number | 否 | 初始保证金倍率 |

#### Quote

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `symbol` | string | 是 | 产品 |
| `bid` | number | 是 | 买价 |
| `ask` | number | 是 | 卖价 |
| `time` | string | 否 | ISO 时间 |

## 8. 计算规则摘要

### 8.1 当前状态

```text
floating = sum(positionProfit)
equity = balance + credit + floating + reportedEquityOffset
margin = calculatedMargin 或 MT5 reported margin
marginLevel = equity / margin
```

盈亏和点值必须考虑产品合约量：

```text
positionProfit = priceDiff * volumeLots * contractSize * profitCurrencyRateToAccount + swap + commission
pointValue = volumeLots * contractSize * point
pointValueAccount = pointValue * profitCurrencyRateToAccount
```

示例：

- `XAUUSD` 1 手合约量为 100 盎司，价格从买入价到 Bid 变化 1 美金，盈亏变化 100 USD。
- `EURUSD` 1 手合约量为 100000，价格变化 1 point `0.00001`，盈亏变化 1 USD。
- `EURGBP` 1 手变化 1 point `0.00001`，点值为 1 GBP；如果账号为 USD，需要接入层提供 GBP 到 USD 的换算率 `profitCurrencyRateToAccount`。

### 8.1.1 产品映射与等价手数

以公斤人民币黄金 `RKGCNH` 映射到 `XAUUSD` 为例：

```json
{
  "RKGCNH": {
    "baseSymbol": "XAUUSD",
    "mappedLotsPerBaseLot": 3.11035,
    "fxSymbol": "USDCNH",
    "baseToMappedPriceMultiplier": 32.15074657,
    "currency": "CNH"
  }
}
```

含义：

```text
1 lot XAUUSD = 100 oz = 3110.35 g = 3.11035 lots RKGCNH
1 lot RKGCNH = 1 / 3.11035 lot XAUUSD
RKGCNH_CNH_per_kg = XAUUSD_USD_per_oz * USDCNH * 1000 / 31.1035
```

同一账号同时持有 `RKGCNH` 和 `XAUUSD` 时，系统按 `baseSymbol` 合并等价手数后计算风险方向和爆仓价；风险结果中的 `convertedPrices` 同时返回 `XAUUSD` 与 `RKGCNH` 的当前价、爆仓临界价和距离点数。

### 8.1.2 Dashboard 产品敞口展示

每个账号在 Dashboard 中展示所有符合筛选条件的产品；同一产品按映射后的基准产品合并为一行净头寸：

```text
symbolExposures = group positions by symbol
grossLots = buyLots + sellLots
netLots = buyLots - sellLots
netDirection = BUY if netLots > 0, SELL if netLots < 0, FLAT if netLots = 0
```

如果 `mt5.symbolMasks` 为 `["*"]`，表示包含所有产品。

### 8.2 爆仓触发条件

```text
marginLevel <= stopOutLevel
```

默认全局值：

```text
stopOutLevel = 0.5
```

即：

```text
净值 / 已用预付款 <= 50%
```

可为单独账号覆盖：

```json
{
  "risk": {
    "accountStopOutLevels": {
      "1001": 0.45,
      "LP-USD": 0.3
    }
  }
}
```

### 8.3 预警触发条件

Dashboard 风险条件由后端统一计算，前端只展示后端返回的 `severity`、距离、阈值和告警结果：

```text
severity = normal | warning | danger
```

其中距离阈值的优先级：

```text
risk.symbolDistancePoints[symbol] > risk.alertDistancePointsDefault
```

邮件和 Telegram 发送会再经过后端通知筛选：

```text
accountScope:
  all         = 客户账号和 LP 账号都参与
  clientsOnly = 只发客户账号
  lpOnly      = 只发 LP 账号

triggerMode:
  any = 满足任一启用条件即发送
  all = 必须满足所有启用条件才发送

distanceToLiquidation:
  distancePoints <= alertDistancePoints

marginLevel:
  由后端比较账号预付款比例与配置阈值

stopOut:
  由后端比较账号预付款比例与账号爆仓比例
```

新版推荐使用 `risk.alertConditions`，账号级使用 `risk.accountOverrides[login].alertConditions` 覆盖全局条件：

```json
{
  "op": "and",
  "rules": [
    { "metric": "marginLevel", "operator": "lte", "value": 0.8 },
    {
      "op": "or",
      "rules": [
        { "metric": "distancePoints", "operator": "lte", "value": 500 },
        { "metric": "grossLots", "operator": "gte", "value": 5 }
      ]
    },
    {
      "op": "not",
      "rules": [
        { "metric": "grossLots", "operator": "gte", "value": 50 }
      ]
    }
  ]
}
```

支持指标：

```text
distancePoints / pips  = 距离爆仓点数
marginLevel            = 净值 / 已用预付款，例如 0.8 表示 80%
marginLevelPercent     = 预付款比例百分数，例如 80
grossLots / lots       = 合并映射后的总手数
netLots / absNetLots   = 合并映射后的净手数绝对值
```

### 8.4 提醒冷却 Key

```text
channel:accountLogin:symbol:direction:stopOutLevel
```

例如：

```text
email:1001:EURUSD:down:0.5
telegram:1001:EURUSD:down:0.5
```

冷却规则：

```text
timeOnly      = 只看 nextAllowedAt
priceOnly     = 当前价相对上次发送价的变动点位 >= priceMovementPoints
timeOrPrice   = 时间到期或价格变动点位满足其一即可再次发送
timeAndPrice  = 时间到期且价格变动点位同时满足才再次发送
```

冷却配置是独立通知策略，不放在每一条 `alertConditions.rules` 里。全局使用 `notifications.cooldown`，单账号覆盖使用 `risk.accountOverrides[login].cooldown`。

## 9. Cursor UI 生成提示词

可以把下面提示词连同本文档一起给 Cursor：

```text
请基于 docs/ui-and-integration-spec.md 为这个 MT5 爆仓风险监控系统生成一个专业的 Web 管理后台 UI。

要求：
1. 不要做营销首页，第一屏就是可用的监控工作台。
2. 使用 SaaS / 风控后台风格，信息密度中等偏高。
3. 主导航只有两个独立面板：Dashboard 和 Configuration。
4. UI 风格需要完全参考 Gemini demo：深色 `zinc` 全屏工作台、顶部品牌栏、顶栏 Dashboard/Configuration 导航、emerald 选中态、红色告警流、右侧近全屏账号详情抽屉从右向左滑入。
5. Dashboard 包含顶部工具栏、指标卡片、风险表格、提醒队列。
6. Configuration 内部必须有五个子标签：
   - MT5：包含 MT5 Manager Account Configuration、Group Filter、LP Account。
   - Symbol List：包含 Symbol Filter、Product Specifications 和产品同步按钮。
   - Symbol Mapping：包含产品映射表格、CSV 模板下载和上传。
   - Email/Telegram：包含 Email server configuration、Email Template、Telegram Bot Configuration、Notification Cooldown。
   - Alert Condition：包含注意/危险两层告警阈值、爆仓比例和 Global Alert Conditions。
7. 风险表格是核心区域，优先保证可读性、排序感和风险状态颜色。
8. 配置页面必须覆盖 MT5 接入、组通配符、产品过滤、自动读取产品规格、产品映射、爆仓比例、单账号爆仓比例覆盖、预警点数、全局预警条件表达式、LP 账号、邮件服务器、邮件模板、Telegram Bot、提醒冷却规则。
9. 前端调用现有 API：
   - GET /api/status
   - GET /api/config
   - PUT /api/config
   - POST /api/check
   - POST /api/monitor/start
   - POST /api/monitor/stop
   - GET /api/risk
10. 保留现有后端，不要改动核心计算逻辑。
11. 支持桌面和移动端响应式。
12. 所有按钮、输入框、表格状态都要有清晰交互反馈。
13. 前端不要内置任何账号、持仓、报价示例数据。
14. 点开账号详情后要有账号级配置页，可覆盖该账号爆仓比例和预警条件表达式。
15. 如果使用 React/Vite，请把 UI 组件拆成 AppShell、Dashboard、RiskTable、Configuration、Mt5ConfigurationTab、EmailNotificationTab、MetricCard 等模块。
```

## 10. 本地模拟运行

Mac 本地模拟：

```bash
python3 mac_local_demo.py
```

如果 Python 启动时报 `No such file or directory: 'node'`，说明当前 Python 进程找不到 Node.js。脚本会自动搜索常见路径，也可以显式指定：

```bash
python3 mac_local_demo.py --node /opt/homebrew/bin/node
```

默认打开：

```text
http://127.0.0.1:2001
```

Node 直接运行：

```bash
npm run demo:web
```

测试：

```bash
npm test
```

部署前环境检查：

```bash
npm run deploy:check
```
