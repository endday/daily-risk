# 市场情绪数据源

## 已接入

### 中国 QVIX

- 标的：300ETF 期权隐含波动率指数
- Source: AKShare `index_option_300etf_qvix`
- Raw endpoint: `https://1.optbbs.com/d/csv/d/k.csv`
- Stored in: `market_sentiment_daily.qvix_close`
- Purpose: A 股风险偏好和期权隐含波动压力
- Notes:
- 采用 AKShare 的同源字段映射：日期列后依次为 300ETF 的 OHLC，收盘值用于温度计算。
  - 历史日线与 A 股交易日对齐，避免 CBOE VIX 的中美交易日错位。
  - API 暴露最新值、涨跌幅、历史分位和标签。
  - 口径：`<15` 市场平静，`15~25` 正常波动，`25~35` 市场担忧，`>=35` 恐慌。

### A-share market fund flow

- Source: EastMoney `push2his` market flow endpoint
- Stored in: `market_sentiment_daily.main_net_inflow` and related size buckets
- Purpose: broad-market capital flow and 5-day trend
- Notes:
  - Raw amounts are stored in the source unit, normally CNY.
  - This is separate from `industry_fund_flow_daily`, which remains the industry-level series.
- A failed market-flow request does not block QVIX updates.

## Existing sources worth keeping

| Data | Source | Use |
| --- | --- | --- |
| Index quote and breadth | EastMoney push2 | Daily market snapshot |
| Index history and fallback | Tencent K-line | Quote fallback when EastMoney is unavailable |
| Index PE history | CSI Index | Valuation percentile and ERP |
| 10Y China government bond yield | ChinaBond | ERP / risk premium |
| Margin balance | EastMoney margin report | Leverage and liquidity |
| Industry fund flow | EastMoney fflow daykline | Breadth, concentration, rotation |

## Operational commands

After applying migrations, run:

```text
POST /admin/sync-market-sentiment?days=1825
```

The normal daily collector uses a long window on the first run and a short incremental window afterwards.
