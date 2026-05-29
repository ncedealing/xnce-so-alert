# MT5 Manager API integration notes

The current repository contains an independent browser-accessible monitoring system. It is not an MT5 server plugin and does not need to be installed on the MT5 server. The live MT5 connection is intentionally isolated behind a backend adapter so Manager API or MT5 Web API can be plugged in without changing the liquidation logic.

This repo now includes a Windows Manager API adapter at `adapters/MT5ManagerSnapshot`. It reads a JSON request from stdin, calls the SDK DLLs in `MetaTrader5SDK/Libs`, and writes one snapshot JSON document to stdout. Node.js uses it when `provider.type` is `managerApi`.

## Deployment shape

- The monitoring system can run on Windows or Linux.
- It must be able to reach the MT5 server or MT5 API endpoint over the network.
- If using the traditional Manager API SDK directly, the API client library normally runs in a standalone Windows process that connects remotely to the MT5 server.
- If the monitoring system must run on Linux without any Windows client library, use MT5 Web API or an equivalent backend adapter that exposes the snapshot contract below.
- Do not install this repository on the MT5 server unless your infrastructure policy explicitly wants that.

## Required Manager API calls

The SDK headers and examples expose the following relevant interfaces and methods:

- `IMTManagerAPI::Connect`
- `IMTManagerAPI::TimeServerRequest`
- `IMTManagerAPI::GroupRequest`
- `IMTManagerAPI::UserRequest` / `UserRequestArray`
- `IMTManagerAPI::UserAccountRequest`
- `IMTManagerAPI::PositionRequest`
- `IMTManagerAPI::SymbolRequest` / `SymbolRequestArray`
- `IMTManagerAPI::SelectedAdd`
- `IMTManagerAPI::TickLast`
- `IMTAccount::Balance`, `Equity`, `Margin`, `MarginLevel`, `MarginLeverage`

## Built-in managerApi provider

Configure the Node system to launch the SDK adapter:

```json
{
  "provider": {
    "type": "managerApi",
    "managerApi": {
      "command": "adapters/MT5ManagerSnapshot/bin/Release64/MT5ManagerSnapshot.exe",
      "args": [],
      "timeoutMs": 30000
    }
  }
}
```

The Manager password is read from `mt5.servers[0].passwordEnv`, for example `MT5_MANAGER_PASSWORD`; do not write it into config files.

## Snapshot contract

The adapter returns this shape:

Response body:

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
      "margin": 1085.2,
      "stopOutLevel": 0.5
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

`serverTime` 必须来自 MT5 服务器或 Manager API 返回值。系统只有在该字段存在且可解析时才刷新服务器时间；如果没有读取到，则保持上一次成功读取的时间。建议返回带 `Z` 或显式时区偏移的 ISO 时间；如果返回不带时区的字符串，例如 `2026-05-28 09:00:00`，系统会按 `mt5.serverTimeZone` 解释，支持 `GMT+2` / `GMT+3`，默认夏令时 `GMT+3`。

The adapter expands group, account login, and symbol filters before returning the snapshot. The Node service still filters groups, account logins, and symbols locally with the same wildcard rules, so accidental over-fetching is contained. `symbols=*` means all products.

## Production notes

- Prefer MT5-reported `equity` and `margin` in the snapshot. The service uses them to calibrate current state and then simulates price moves from that baseline.
- Product specifications are read from Manager API `SymbolRequest` / `SymbolRequestArray`. The adapter should return `contractSize`, `point`, `digits`, `currencyProfit`, `currencyMargin`, and available margin parameters in the `symbols` payload; users should not need to upload a product list.
- If you can call margin-check APIs cheaply, the adapter can pre-fill per-position `margin`; set `risk.treatReportedMarginAsFixed=true` when you want the monitor to keep current used margin fixed during the liquidation-price search.
- If the broker has account-specific stop-out settings, pass `account.stopOutLevel` in the snapshot or configure `risk.accountStopOutLevels` by login in the monitor.
- If using mapped products such as `RKGCNH -> XAUUSD`, the adapter should include quotes for the mapped symbol, the base symbol, and the FX symbol such as `USDCNH`. The monitor keeps `USDCNH` fixed while simulating XAUUSD price movement and derives the mapped CNH liquidation price for display.
