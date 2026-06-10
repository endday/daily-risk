# 日历效应模块设计文档

> 版本: v0.2 (Draft)
> 日期: 2026-06-09
> 状态: 调研完成，方案确定，待实现
>
> 变更日志：
> - v0.2: 增加"今日+本月"左右两栏卡片设计、月度日历网格、每日涨跌概率数据
> - v0.1: 初始版本，月度概率条 + 特殊窗口卡片

---

## 一、背景与目标

### 1.1 背景

用户在看"明日风险榜"时，看到的是**事件驱动**的信息——"明天有什么大事"。但投资决策还需要另一个维度：**统计规律**——"历史上这一天/这个月表现怎么样"。

A股市场存在多个经过实证检验的日历效应（Calendar Effect），包括月度效应、春节效应、两会效应、财报季效应等。将这些统计规律融入风险榜，可以给用户更完整的参考视角。

### 1.2 目标

- 在不增加用户认知负担的前提下，提供历史统计参考
- 与现有"事件风险"形成互补：事件风险告诉你"明天有什么"，日历效应告诉你"历史上这类时候怎么样"
- 数据量极小（< 10KB），开发成本低，维护频率低（年度更新）

### 1.3 不做

- 不做一个独立的"数据分析页"或"量化回测工具"
- 不展示统计意义弱的效应（如星期效应，近年已消失）
- 不做个股级别的日历效应（噪声太大）
- 不做实时计算（离线预计算，静态文件存储）

---

## 二、效应调研与筛选

### 2.1 已验证的 A 股日历效应

经过对学术研究和市场实证的调研，A 股存在以下日历效应：

#### 月度效应

| 月份 | 历史表现 | 上涨概率 | 驱动因素 | 置信度 |
|------|----------|----------|----------|--------|
| 1月 | 中等偏好 | ~62% | 年初资金宽松 | ⭐⭐⭐ |
| **2月** | **全年最强** | **~69%** | **春季躁动 + 春节效应 + 信贷投放** | **⭐⭐⭐⭐⭐** |
| 3月 | 偏弱 | ~45% | 两会期间震荡 | ⭐⭐⭐ |
| **4月** | **全年最弱之一** | **~40%** | **年报/一季报集中披露，业绩雷** | **⭐⭐⭐⭐** |
| 5月 | 偏弱 | ~45% | "五穷" | ⭐⭐ |
| 6月 | 偏弱 | ~50% | "六绝"，资金紧张 | ⭐⭐ |
| **7月** | **偏强** | **~55-60%** | **"七翻身"，半年报预期** | **⭐⭐⭐⭐** |
| 8月 | 中性 | ~50% | 半年报披露 | ⭐⭐ |
| 9月 | 偏弱 | ~45% | 国庆前缩量调整 | ⭐⭐⭐ |
| **10月** | **偏强** | **~58%** | **"红十月"，节后资金回流** | **⭐⭐⭐⭐** |
| 11月 | 中等偏好 | ~55% | 政策预期 | ⭐⭐⭐ |
| 12月 | 中等偏好 | ~55% | 年末效应，基金排名 | ⭐⭐⭐ |

> 数据来源：上证指数 1991-2026，约 34 年历史数据

#### 春节效应（全年最强单一效应）

| 时段 | 表现 | 数据支撑 | 置信度 |
|------|------|----------|--------|
| 腊月十八 → 正月十八 | 约 1 个月上涨态势 | 近 10 年几乎每年验证 | ⭐⭐⭐⭐⭐ |
| 节前 5 个交易日 | 10 年中 7 年上涨 | 平均涨幅中性 | ⭐⭐⭐⭐ |
| **节后 5 个交易日** | **10 年中 7 年上涨** | **平均涨幅 +1.95%** | **⭐⭐⭐⭐⭐** |
| 节后首日 | 6 涨 4 跌 | 偏强 | ⭐⭐⭐ |

驱动因素：
- 春节期间消费数据提振信心
- 节后银行信贷集中投放
- 政策窗口期（通常两会前有预热）
- 投资者情绪修复

#### 两会效应

| 时段 | 表现 | 置信度 |
|------|------|--------|
| 会前 2 周 | 上涨概率高，风险偏好提升 | ⭐⭐⭐⭐ |
| 会前 1 周 | 继续偏强 | ⭐⭐⭐ |
| **会中** | **窄幅震荡，表现疲软** | **⭐⭐⭐⭐** |
| 会后 1 个月 | 上涨概率 ~60%，震荡回升 | ⭐⭐⭐ |

固定时间窗口：通常 3 月 3 日-3 月 11 日左右（具体每年公布）

风格特征：
- 会前：偏中小盘和成长股
- 会后：消费风格领先

#### 月初/月末效应（Turn-of-Month）

| 时段 | 表现 | 置信度 |
|------|------|--------|
| 每月最后 1 个交易日 | 收益率偏高 | ⭐⭐⭐⭐ |
| 下月前 3 个交易日 | 收益率显著高于月内其他时段 | ⭐⭐⭐⭐ |
| 前 9 个交易日 | 贡献全月主要正收益 | ⭐⭐⭐ |

驱动因素：个人投资者月末资金流入增加，机构月末调仓

#### 财报季效应

| 财报季 | 披露截止 | 市场影响 | 置信度 |
|--------|----------|----------|--------|
| 年报 + 一季报 | 4 月底 | ⚠️ **4 月最危险**，业绩雷集中暴露 | ⭐⭐⭐⭐ |
| 半年报 | 8 月底 | 中等影响 | ⭐⭐⭐ |
| 三季报 | 10 月底 | 影响较小 | ⭐⭐ |
| 年报预告 | 1 月底 | 微盘股 1 月均跌 -2.09% | ⭐⭐⭐ |

关键规律：
- "好财报早报，坏财报晚报"——业绩差的公司倾向在最后几天才披露
- 4 月下旬（年报最后披露期）是风险最高时段
- 对微盘股/小盘股影响最大

#### 红十月效应

| 时段 | 表现 | 数据支撑 |
|------|------|----------|
| 国庆后 1 周 | 上涨概率较高 | 2010 年以来 14 年中多数上涨 |
| 节后首日成交量 | 明显放大 | 如 2025 年达 2.65 万亿 |
| 海外假期波动 | 对节后 A 股影响有限 | — |

#### 五穷六绝七翻身

| 月份 | 实证数据 | 是否有依据 |
|------|----------|------------|
| 5月 | 下跌概率 ~55% | 有一定依据，但不绝对 |
| 6月 | 下跌概率 ~50% | 依据较弱 |
| 7月 | 上涨概率 ~55-60% | "七翻身"较有依据 |

#### 星期效应（⚠️ 正在消失）

| 模式 | 表现 | 当前状态 |
|------|------|----------|
| 黑色星期四 | 近 10 年周四涨跌均值为负 | ⚠️ 近年已消失 |
| 红色星期一 | 周一偏强 | ⚠️ 近年效应减弱 |
| 周内 V 型 | 周一→周四下降，周五反弹 | ⚠️ 减弱 |

### 2.2 筛选标准

根据以下标准筛选要展示的效应：

| 标准 | 权重 | 说明 |
|------|------|------|
| 统计显著性 | 高 | 至少 10 年以上数据验证 |
| 当前有效性 | 高 | 近 5-10 年仍然成立的 |
| 用户可理解性 | 中 | 普通投资者能理解的 |
| 与风险榜互补性 | 中 | 能补充事件风险的不足 |
| 时效性 | 低 | 不频繁变化，不需要每月更新 |

### 2.3 筛选结果

| 级别 | 效应 | 决策 | 理由 |
|------|------|------|------|
| **必做** | 月度概率分布 | ✅ 纳入 | 基础数据，所有用户都能参考 |
| **必做** | 春节效应 | ✅ 纳入 | 最强效应，每年固定验证 |
| **必做** | 财报季提示 | ✅ 纳入 | 4 月风险提示，与风险榜高度互补 |
| **推荐** | 两会效应 | ✅ 纳入 | 固定窗口，有统计意义 |
| **推荐** | 月初/月末效应 | ✅ 纳入 | 短期可操作 |
| **推荐** | 红十月 | ✅ 纳入 | 10 月提示 |
| **暂不做** | 星期效应 | ❌ 排除 | 近年消失，展示会误导 |
| **暂不做** | 五穷六绝 | ❌ 排除 | 概率存在但不绝对，争议大 |

---

## 三、展示设计

### 3.1 设计原则

1. **辅助而非主导**：日历效应是参考信息，不应抢走"事件风险"的 C 位
2. **按需出现**：只有当日期命中某个效应窗口时才展示，不是每天都有一堆提示
3. **一句话说清**：每个提示用 1-2 行文字 + 一个概率数字，不展开学术分析
4. **视觉区分**：用颜色/图标区分利好（红/暖色）和利空（绿/冷色）提示

### 3.2 展示模块

#### 模块 A：今日 + 本月概率卡片（常驻显示）

始终显示一张紧凑卡片，**左右两栏并排**：左侧"今日"（几号的历史概率），右侧"本月"（整个月的历史概率）。主次分明——"今日"字号略大。

```
┌─────────────────────────────────────────────────────────┐
│  📊 历史统计 · 6月9日 · 上证指数 · 近20年                 │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐     │
│  │  今日 (9号)           │  │  本月 (6月)           │     │
│  │                      │  │                      │     │
│  │  涨54%  均+0.3%      │  │  涨50%  均+0.1%      │     │
│  │  ██████░░░░          │  │  ██████░░░░          │     │
│  │  N=240               │  │  N=240               │     │
│  └──────────────────────┘  └──────────────────────┘     │
│                                                          │
│  [展开查看完整月度日历 ▼]                                  │
│                                                          │
│  💡 历史统计不代表未来表现                                 │
└─────────────────────────────────────────────────────────┘
```

**设计要点**：
- 标题直接写"6月9日"——用户第一眼知道今天
- 左右两栏并排：左侧"今日"，右侧"本月"
- "今日"字号略大或加粗——主次分明
- 底部折叠入口——想看详情的用户点击展开

**颜色编码**：
- `涨>55%` → 红色/暖色（利好）
- `涨<45%` → 绿色/冷色（利空）
- `45-55%` → 灰色（中性）

#### 模块 A 展开：月度日历网格

点击"展开"后，显示当月每日概率分布，**当天高亮**：

```
┌─────────────────────────────────────────────────────────┐
│  📊 6月 每日涨跌概率 · 上证指数 · 近20年    [收起 ▲]     │
│                                                          │
│     一    二    三    四    五    六    日               │
│  1  58%   55%   52%   50%   54%   48%   46%            │
│  8  50%   52%   54%   50%   48%   52%   50%            │
│  15 48%   50%   52%   48%   50%   52%   48%            │
│  22 50%   52%   54%   56%   58%   60%   59%            │
│  29 58%   --    --                                        │
│                                                          │
│  ◀ 今天 6月9日                                            │
│                                                          │
│  💡 月末最后几天历史上涨概率偏高                           │
└─────────────────────────────────────────────────────────┘
```

**布局**：
- 7 列（周一到周日）× 5 行（每月最多 31 天）
- 每格显示：日期 + 上涨概率
- 颜色按概率编码（红>55% / 灰45-55% / 绿<45%）
- 当天日期：加粗 + 边框高亮
- 非交易日：显示 `--`
- 底部提示：如月末概率偏高，加一句"月末最后几天历史上涨概率偏高"

#### 模块 B：特殊窗口提示（条件触发）

当日期落在某个效应窗口内时，在概率卡片**顶部增加一条横幅**，与模块 A 融为一体：

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️ 财报披露期 · 4月是年报雷高发期                        │  ← 特殊窗口横幅
├─────────────────────────────────────────────────────────┤
│  📊 历史统计 · 4月15日 · 上证指数 · 近20年                │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐     │
│  │  今日 (15号)          │  │  本月 (4月)           │     │
│  │  涨48%  均-0.1%      │  │  涨40%  均-0.6%      │     │
│  │  █████░░░░░          │  │  ████░░░░░░          │     │
│  └──────────────────────┘  └──────────────────────┘     │
│                                                          │
│  [展开查看完整月度日历 ▼]                                  │
└─────────────────────────────────────────────────────────┘
```

**各特殊窗口的横幅文案**：

| 窗口 | 横幅文案 | 触发时间 |
|------|----------|----------|
| 🧧 春节效应 | `距春节还有 N 个交易日 · 节后5日历史均涨+1.95%` | 春节前后各10个交易日 |
| 🏛️ 两会效应 | `两会进行中 · 会中震荡偏弱，会后1月涨60%` | 3月1日-3月20日 |
| 📋 财报季 | `财报披露期 · 4月是年报雷高发期` | 4月/8月/10月 |
| 📅 月末效应 | `月末效应窗口 · 该窗口历史收益率偏高` | 月末最后2日 + 月初前3日 |
| 🍂 红十月 | `红十月 · 国庆后1周历史涨>60%` | 10月1日-10月15日 |

**横幅设计**：
- 背景色：淡黄（⚠️）或淡红（🧧），与窗口类型对应
- 左侧图标 + 右侧一行文案
- 高度固定 32px，不抢占主体空间
- 最多 1 条横幅（优先级高的优先展示）

### 3.3 优先级与冲突处理

同一天可能命中多个窗口，横幅只展示优先级最高的 1 条：

| 优先级 | 效应 | 理由 |
|--------|------|------|
| 1 | 春节效应 | 最强效应 |
| 2 | 财报季（4月） | 风险提示优先 |
| 3 | 两会效应 | 政策敏感期 |
| 4 | 红十月 | 中等强度 |
| 5 | 月末效应 | 短期窗口 |

**模块 A（今日+本月卡片）始终显示**，不受优先级影响。

### 3.4 移动端 vs PC 端

**移动端**：
- 月度概率条：默认折叠，只显示当前月 + 特殊标签月，点击展开全部
- 特殊窗口卡片：全宽卡片，插入事件列表上方
- 横向日期导航条下方

**PC 端**：
- 月度概率条：可放右侧边栏或页面底部
- 特殊窗口卡片：和事件列表并排或上方

---

## 四、数据设计

### 4.1 数据文件格式

静态 JSON 文件，存放在 `worker/data/calendar-effects.json`，和 `china-events.json`、`risk-rules.json` 同级。

```json
{
  "version": "2026",
  "updated_at": "2026-06-09",
  "description": "A股日历效应统计数据，用于风险榜辅助展示",
  "disclaimer": "历史统计不代表未来表现，仅供参考",

  "indices": [
    {
      "code": "000001",
      "name": "上证指数",
      "years": 34,
      "data_start": "1991-07-15",
      "data_end": "2025-12-31"
    }
  ],

  "monthly": {
    "index_code": "000001",
    "years": 20,
    "data": [
      {
        "month": 1,
        "sample_count": 400,
        "up_count": 248,
        "up_probability": 0.62,
        "avg_change_pct": 0.8,
        "median_change_pct": 0.5,
        "max_gain_pct": 8.2,
        "max_loss_pct": -7.3,
        "label": null,
        "confidence": 3
      },
      {
        "month": 2,
        "sample_count": 400,
        "up_count": 276,
        "up_probability": 0.69,
        "avg_change_pct": 1.5,
        "median_change_pct": 1.2,
        "max_gain_pct": 12.5,
        "max_loss_pct": -5.1,
        "label": "春季躁动",
        "confidence": 5
      },
      {
        "month": 3,
        "sample_count": 400,
        "up_count": 180,
        "up_probability": 0.45,
        "avg_change_pct": -0.3,
        "median_change_pct": -0.5,
        "max_gain_pct": 6.1,
        "max_loss_pct": -8.4,
        "label": "两会震荡",
        "confidence": 3
      },
      {
        "month": 4,
        "sample_count": 400,
        "up_count": 160,
        "up_probability": 0.40,
        "avg_change_pct": -0.6,
        "median_change_pct": -0.8,
        "max_gain_pct": 5.3,
        "max_loss_pct": -9.2,
        "label": "财报雷期",
        "confidence": 4
      },
      {
        "month": 5,
        "sample_count": 400,
        "up_count": 180,
        "up_probability": 0.45,
        "avg_change_pct": -0.2,
        "median_change_pct": -0.3,
        "max_gain_pct": 7.1,
        "max_loss_pct": -8.0,
        "label": null,
        "confidence": 2
      },
      {
        "month": 6,
        "sample_count": 400,
        "up_count": 200,
        "up_probability": 0.50,
        "avg_change_pct": 0.1,
        "median_change_pct": 0.0,
        "max_gain_pct": 6.8,
        "max_loss_pct": -7.5,
        "label": null,
        "confidence": 2
      },
      {
        "month": 7,
        "sample_count": 400,
        "up_count": 232,
        "up_probability": 0.58,
        "avg_change_pct": 0.8,
        "median_change_pct": 0.6,
        "max_gain_pct": 9.1,
        "max_loss_pct": -6.3,
        "label": "七翻身",
        "confidence": 4
      },
      {
        "month": 8,
        "sample_count": 400,
        "up_count": 200,
        "avg_change_pct": 0.2,
        "up_probability": 0.50,
        "median_change_pct": 0.1,
        "max_gain_pct": 7.5,
        "max_loss_pct": -7.8,
        "label": null,
        "confidence": 2
      },
      {
        "month": 9,
        "sample_count": 400,
        "up_count": 180,
        "up_probability": 0.45,
        "avg_change_pct": -0.3,
        "median_change_pct": -0.4,
        "max_gain_pct": 5.9,
        "max_loss_pct": -8.6,
        "label": null,
        "confidence": 3
      },
      {
        "month": 10,
        "sample_count": 400,
        "up_count": 232,
        "up_probability": 0.58,
        "avg_change_pct": 0.7,
        "median_change_pct": 0.5,
        "max_gain_pct": 8.8,
        "max_loss_pct": -6.9,
        "label": "红十月",
        "confidence": 4
      },
      {
        "month": 11,
        "sample_count": 400,
        "up_count": 220,
        "up_probability": 0.55,
        "avg_change_pct": 0.4,
        "median_change_pct": 0.3,
        "max_gain_pct": 7.2,
        "max_loss_pct": -7.1,
        "label": null,
        "confidence": 3
      },
      {
        "month": 12,
        "sample_count": 400,
        "up_count": 220,
        "up_probability": 0.55,
        "avg_change_pct": 0.3,
        "median_change_pct": 0.2,
        "max_gain_pct": 6.5,
        "max_loss_pct": -7.4,
        "label": null,
        "confidence": 3
      }
    ]
  },

  "daily_by_month": {
    "index_code": "000001",
    "years": 20,
    "description": "每月1-31号的历史涨跌概率，每月最多31条",
    "data": {
      "1": [
        { "day": 1, "sample_count": 240, "up_probability": 0.58, "avg_change_pct": 0.4 },
        { "day": 2, "sample_count": 240, "up_probability": 0.55, "avg_change_pct": 0.3 },
        { "day": 3, "sample_count": 240, "up_probability": 0.52, "avg_change_pct": 0.2 },
        "...(共31条，仅展示前3条示例)...",
        { "day": 31, "sample_count": 120, "up_probability": 0.56, "avg_change_pct": 0.3 }
      ],
      "2": [
        { "day": 1, "sample_count": 240, "up_probability": 0.60, "avg_change_pct": 0.5 },
        "...(共28-29条)...",
        { "day": 28, "sample_count": 240, "up_probability": 0.54, "avg_change_pct": 0.3 }
      ],
      "...(共12个月，每月一个数组)...": "",
      "12": [
        { "day": 1, "sample_count": 240, "up_probability": 0.56, "avg_change_pct": 0.3 },
        "...(共31条)...",
        { "day": 31, "sample_count": 240, "up_probability": 0.58, "avg_change_pct": 0.4 }
      ]
    },
    "note": "非交易日（周末、节假日）的 is_trading_day 标记为 false，前端显示 --"
  },

  "special_windows": [
    {
      "key": "spring_festival",
      "name": "春节效应",
      "icon": "🧧",
      "type": "chinese_calendar",
      "description": "春节前后是A股全年最强上涨窗口",
      "phases": [
        {
          "name": "春节前",
          "offset_days": -5,
          "offset_unit": "trading_day",
          "up_probability": 0.70,
          "avg_change_pct": 0.5,
          "tip": "节前资金面偏紧但情绪偏乐观"
        },
        {
          "name": "春节后",
          "offset_days": 5,
          "offset_unit": "trading_day",
          "up_probability": 0.70,
          "avg_change_pct": 1.95,
          "tip": "节后资金回流，全年最佳窗口"
        }
      ],
      "confidence": 5,
      "trigger_range": "春节前10个交易日 至 节后10个交易日"
    },
    {
      "key": "two_sessions",
      "name": "两会效应",
      "icon": "🏛️",
      "type": "fixed_date_range",
      "date_range": { "start": "03-01", "end": "03-20" },
      "description": "全国两会期间政策预期强烈",
      "phases": [
        {
          "name": "会前",
          "trigger": "before_start",
          "days": 14,
          "tip": "政策预期升温，风险偏好提升",
          "style_bias": "中小盘/成长股占优"
        },
        {
          "name": "会中",
          "trigger": "during",
          "tip": "震荡偏弱，预期已部分兑现"
        },
        {
          "name": "会后",
          "trigger": "after_end",
          "days": 30,
          "up_probability": 0.60,
          "tip": "政策落地期，消费风格领先"
        }
      ],
      "confidence": 4
    },
    {
      "key": "earnings_deadline_q1",
      "name": "年报+一季报披露期",
      "icon": "📋",
      "type": "month_range",
      "month": 4,
      "description": "年报和一季报集中披露，业绩雷高发期",
      "warning": "好财报早报，坏财报晚报。4月下旬是业绩雷集中爆发期。",
      "up_probability": 0.40,
      "avg_change_pct": -0.6,
      "impact": "微盘股影响最大（1月均跌-2.09%）",
      "confidence": 4
    },
    {
      "key": "earnings_deadline_h1",
      "name": "半年报披露期",
      "icon": "📋",
      "type": "month_range",
      "month": 8,
      "description": "半年报集中披露",
      "warning": "关注业绩不及预期个股的拖累效应",
      "confidence": 3
    },
    {
      "key": "earnings_deadline_q3",
      "name": "三季报披露期",
      "icon": "📋",
      "type": "month_range",
      "month": 10,
      "description": "三季报集中披露",
      "warning": "影响相对较小，但需关注龙头公司业绩",
      "confidence": 2
    },
    {
      "key": "turn_of_month",
      "name": "月末效应",
      "icon": "📅",
      "type": "day_of_month_range",
      "ranges": [
        { "start": -1, "end": 3, "description": "月末最后1日 + 下月前3日" }
      ],
      "description": "月末月初资金面偏松，收益率显著高于月内其他时段",
      "confidence": 4
    },
    {
      "key": "golden_october",
      "name": "红十月",
      "icon": "🍂",
      "type": "fixed_date_range",
      "date_range": { "start": "10-01", "end": "10-15" },
      "description": "国庆后资金回流，历史表现偏强",
      "up_probability": 0.60,
      "tip": "关注消费/旅游数据验证",
      "confidence": 4
    }
  ]
}
```

### 4.2 数据生成

通过离线 Python 脚本生成，使用 AKShare 获取历史数据：

```
scripts/generate-calendar-stats.py
```

脚本职责：
1. 调用 AKShare 获取上证指数 20 年日线数据
2. 计算**月度统计**：12 个月的上涨概率、平均涨幅等
3. 计算**每日统计**：每月 1-31 号各自的上涨概率、平均涨幅（`daily_by_month`）
4. 计算**特殊窗口统计**：春节、两会、财报季等
5. 输出 JSON 到 `worker/data/calendar-effects.json`

每日统计核心逻辑：
```python
# 伪代码
df['day_of_month'] = df['date'].dt.day
df['month'] = df['date'].dt.month

# 按月分组，每月内按"几号"统计
for month in range(1, 13):
    month_data = df[df['month'] == month]
    for day in range(1, 32):
        day_data = month_data[month_data['day_of_month'] == day]
        if len(day_data) > 0:
            daily_by_month[month].append({
                "day": day,
                "sample_count": len(day_data),
                "up_probability": (day_data['change_pct'] > 0).mean(),
                "avg_change_pct": day_data['change_pct'].mean()
            })
```

运行频率：每年 1 月运行一次，更新上一年数据。

### 4.3 数据更新策略

| 项目 | 策略 |
|------|------|
| 原始数据 | AKShare 免费，无限制 |
| 更新频率 | 每年 1 次（1 月份更新） |
| 更新方式 | 本地运行 Python 脚本，提交 JSON 到 repo |
| 部署 | git push 后 Worker 自动读取新 JSON |
| 数据校验 | 脚本内检查数据完整性（样本数 > 200，日期连续） |

---

## 五、API 设计

### 5.1 新增端点

**不需要新增 API 端点。** 日历效应数据随事件 API 一起返回，作为响应的一部分：

```
GET /api/events?date=2026-06-09
```

响应增加 `calendar_effects` 字段：

```json
{
  "date": "2026-06-09",
  "timezone": "Asia/Shanghai",
  "risk_index": 8.5,
  "events": [...],
  "updated_at": "2026-06-09T06:00:00Z",
  "calendar_effects": {
    "today": {
      "day_of_month": 9,
      "up_probability": 0.54,
      "avg_change_pct": 0.3,
      "sample_count": 240
    },
    "this_month": {
      "month": 6,
      "up_probability": 0.50,
      "avg_change_pct": 0.1,
      "label": null
    },
    "daily_calendar": [
      { "day": 1, "up_probability": 0.58, "avg_change_pct": 0.4, "is_trading_day": true },
      { "day": 2, "up_probability": 0.55, "avg_change_pct": 0.3, "is_trading_day": true },
      ...
      { "day": 9, "up_probability": 0.54, "avg_change_pct": 0.3, "is_trading_day": true },
      ...
      { "day": 30, "up_probability": 0.60, "avg_change_pct": 0.5, "is_trading_day": true }
    ],
    "active_banner": {
      "key": "turn_of_month",
      "name": "月末效应",
      "icon": "📅",
      "text": "月末效应窗口 · 该窗口历史收益率偏高"
    },
    "yearly_overview": {
      "best_month": { "month": 2, "up_probability": 0.69, "label": "春季躁动" },
      "worst_month": { "month": 4, "up_probability": 0.40, "label": "财报雷期" }
    }
  }
}
```

### 5.2 Worker 实现

Worker 在启动时加载 `calendar-effects.json` 到内存（和 `risk-rules.json` 一样），每次请求时根据当前日期匹配活跃窗口：

```typescript
// 伪代码
function getActiveCalendarEffects(date: Date, calendarData: CalendarEffectsData) {
  const month = date.getMonth() + 1;  // 1-12
  const dayOfMonth = date.getDate();  // 1-31

  // 1. 今日概率（几号的历史数据）
  const today = calendarData.daily_by_month[month].find(d => d.day === dayOfMonth);

  // 2. 本月概率
  const thisMonth = calendarData.monthly.data.find(m => m.month === month);

  // 3. 当月每日日历（用于展开网格）
  const dailyCalendar = calendarData.daily_by_month[month];

  // 4. 匹配特殊窗口横幅（最多 1 条，优先级最高的）
  const activeWindows = [];
  for (const window of calendarData.special_windows) {
    const match = matchWindow(date, window, calendarData);
    if (match) activeWindows.push(match);
  }
  activeWindows.sort((a, b) => a.priority - b.priority);
  const activeBanner = activeWindows[0] || null;

  // 5. 年度概览
  const best = calendarData.monthly.data.reduce((a, b) => a.up_probability > b.up_probability ? a : b);
  const worst = calendarData.monthly.data.reduce((a, b) => a.up_probability < b.up_probability ? a : b);

  return {
    today,
    this_month: thisMonth,
    daily_calendar: dailyCalendar,
    active_banner: activeBanner,
    yearly_overview: {
      best_month: { month: best.month, up_probability: best.up_probability, label: best.label },
      worst_month: { month: worst.month, up_probability: worst.up_probability, label: worst.label }
    }
  };
}
```

---

## 六、前端设计

### 6.1 组件拆分

新增 3 个 Vue 组件：

| 组件 | 职责 | 位置 |
|------|------|------|
| `CalendarStatsCard.vue` | 今日+本月概率卡片（左右两栏） | 风险指数下方，常驻 |
| `MonthlyCalendarGrid.vue` | 月度日历网格（展开后显示） | CalendarStatsCard 内部，折叠 |
| `CalendarBanner.vue` | 特殊窗口横幅 | CalendarStatsCard 顶部，条件显示 |

### 6.2 与现有组件的关系

```
Index.vue
├── DateNav.vue              ← 日期导航（现有）
├── RiskIndex.vue            ← 风险指数（现有）
├── CalendarStatsCard.vue    ← 新增：日历效应
│   ├── CalendarBanner.vue   ← 特殊窗口横幅（0-1 条）
│   ├── 今日+本月概率（左右两栏）
│   └── MonthlyCalendarGrid.vue ← 月度日历（折叠/展开）
├── RiskCard.vue / RiskTable.vue ← 事件列表（现有）
└── ...
```

### 6.3 视觉规范

| 元素 | 规范 |
|------|------|
| 概率条高度 | 8px（移动端）/ 12px（PC） |
| 利好色 | `#e74c3c`（红色，上涨概率 >55%） |
| 利空色 | `#27ae60`（绿色，上涨概率 <45%） |
| 中性色 | `#95a5a6`（灰色，45-55%） |
| 当前月高亮 | 背景 `#fff3e0`（浅橙）+ 左侧 3px 实色边框 |
| 特殊窗口卡片 | 圆角 12px，左侧 4px 彩色边框，浅色背景 |
| 字体 | 标题 14px 加粗，正文 13px，概率数字 16px 加粗 |

### 6.4 交互细节

- 月度概率条默认只展示 3-4 个关键月份（当前月 + 有 label 的月份）
- 提供"展开全部 12 个月"按钮
- 特殊窗口卡片可左滑关闭（用户不感兴趣时）
- 点击卡片展开可看更详细说明（折叠/展开）
- 添加免责声明小字："历史统计不代表未来表现，仅供参考"

---

## 七、窗口匹配规则

### 7.1 匹配类型

| type | 说明 | 示例 |
|------|------|------|
| `chinese_calendar` | 基于农历日期 | 春节前后 N 个交易日 |
| `fixed_date_range` | 固定公历日期范围 | 两会 3/1-3/20，红十月 10/1-10/15 |
| `month_range` | 指定月份 | 4月/8月/10月（财报季） |
| `day_of_month_range` | 每月指定日期范围 | 月末最后1日 + 月初前3日 |

### 7.2 农历日期计算

春节日期每年不同，需要农历转公历。方案：

| 方案 | 优缺点 |
|------|--------|
| **预计算表** | ✅ 最简单，Worker 无依赖；❌ 需要每年更新 |
| `lunar-javascript` npm 包 | ✅ 纯 JS，Worker 可用；❌ 增加 ~30KB |
| 预计算 JSON（未来 10 年春节日期） | ✅ 零依赖，<1KB；❌ 10 年需更新 |

**推荐方案：预计算 JSON**

```json
{
  "spring_festival_dates": {
    "2025": "2025-01-29",
    "2026": "2026-02-17",
    "2027": "2027-02-06",
    "2028": "2028-01-26",
    "2029": "2029-02-13",
    "2030": "2030-02-03",
    "2031": "2031-01-23",
    "2032": "2032-02-11",
    "2033": "2033-01-31",
    "2034": "2034-02-19",
    "2035": "2035-02-08"
  }
}
```

嵌入 `calendar-effects.json`，Worker 直接使用。10 年更新一次足够。

### 7.3 交易日计算

春节前后 N "个交易日"需要排除周末和节假日。方案：

- **V1.5 简化方案**：用自然日近似（春节前后 7 个自然日 ≈ 5 个交易日）
- **V2 精确方案**：引入交易日历（AKShare `tool_trade_date_hist_sina`）

V1.5 先用自然日近似，误差可接受。

---

## 八、实现计划

### 8.1 阶段划分

| 阶段 | 内容 | 估时 |
|------|------|------|
| **Step 1** | 编写 Python 脚本，计算月度+每日+特殊窗口统计，生成 `calendar-effects.json` | 1 天 |
| **Step 2** | Worker 加载 JSON，实现窗口匹配 + 今日/本月概率查询逻辑 | 1 天 |
| **Step 3** | API 响应增加 `calendar_effects` 字段（含 `today`/`this_month`/`daily_calendar`/`active_banner`） | 0.5 天 |
| **Step 4** | 前端：`CalendarStatsCard.vue`（左右两栏概率卡片） | 1 天 |
| **Step 5** | 前端：`MonthlyCalendarGrid.vue`（月度日历网格，折叠/展开） | 1 天 |
| **Step 6** | 前端：`CalendarBanner.vue`（特殊窗口横幅）+ 集成到 Index.vue | 0.5 天 |
| **Step 7** | 联调 + 数据验证 + 部署 | 0.5 天 |
| **总计** | | **5.5 天** |

### 8.2 依赖

| 依赖 | 说明 |
|------|------|
| Python + AKShare | 离线脚本环境（本地或 GitHub Actions） |
| 无新的 npm 依赖 | 纯 Vue 组件，不需要额外库 |
| 无新的 D1 表 | 静态 JSON，不需要数据库 |
| 无新的 API 端点 | 复用现有 `/api/events` |

### 8.3 验证清单

- [ ] 月度概率数据与已知公开数据交叉验证
- [ ] 春节日期匹配正确（至少验证 2024-2026 三年）
- [ ] 4 月财报季提示正确触发
- [ ] 同一天命中多个窗口时，优先级正确
- [ ] 移动端和 PC 端显示正常
- [ ] JSON 文件加载不影响现有 API 响应速度

---

## 九、风险与限制

| 风险 | 影响 | 缓解 |
|------|------|------|
| 历史统计不代表未来 | 用户可能误解为预测 | 页面加免责声明，文案用"历史统计"而非"预测" |
| 数据过时（>3 年未更新） | 统计失真 | 脚本标注 `updated_at`，前端展示数据截止年份 |
| 效应消失（市场趋有效） | 展示无效信息 | 标注置信度等级，低置信度效应灰色展示 |
| 春节日期计算错误 | 窗口匹配失败 | 预计算表交叉验证，单元测试覆盖 |
| 用户信息过载 | 体验下降 | 横幅最多 1 条，日历网格默认折叠 |

---

## 十、后续演进

### V2 扩展方向

- **沪深 300 / 创业板指**：增加多指数对比
- **行业日历效应**：哪些行业在哪些月份表现好
- **用户自定义关注**：选择只看某些效应
- **效应强度实时追踪**：用当年已发生数据更新概率
- **交易日历精确化**：引入完整 A 股交易日历
- **与事件风险联动**：如"4 月财报季 + 明天 CPI = 双重风险"

### 不做

- 不做到个股日历效应（噪声太大）
- 不做回测功能（定位不是量化工具）
- 不做用户自定义效应规则（复杂度过高）

---

## 附录 A：数据验证来源

| 数据 | 验证来源 |
|------|----------|
| 月度上涨概率 | 东方财富Choice、Wind |
| 春节效应 | 招商证券、华泰证券年度策略报告 |
| 两会效应 | 中信建投、国泰君安研报 |
| 财报季效应 | 海通证券"财报月的日历效应"研究 |
| Turn-of-Month | 学术研究：Ariel (1987), 中国市场验证论文 |

## 附录 B：置信度等级说明

| 等级 | 含义 | 展示方式 |
|------|------|----------|
| ⭐⭐⭐⭐⭐ (5) | 30 年以上数据验证，近年仍成立 | 正常展示 |
| ⭐⭐⭐⭐ (4) | 20 年以上数据验证，近年仍成立 | 正常展示 |
| ⭐⭐⭐ (3) | 10 年以上数据，近年有减弱趋势 | 正常展示 |
| ⭐⭐ (2) | 数据支撑较弱或争议较大 | 灰色弱化展示 |
| ⭐ (1) | 仅在特定子时期成立 | 不展示 |

---

## 附录 C：GitHub 竞品与参考项目调研

### C.1 直接相关项目

#### 1. handiko/Market-Seasonality-Chart-Generator

- **GitHub**: https://github.com/handiko/Market-Seasonality-Chart-Generator
- **语言**: Python (Jupyter Notebook)
- **Stars**: 4
- **做什么**: 为 Yahoo Finance 上的任意标的生成"季节性曲线图"
- **核心方法**:
  - 取过去 N 年（默认 10 年）的日线数据
  - 计算每个"年内第几天"的平均日收益率
  - 累计求和，画出全年 365 天的累计平均收益曲线
  - 输出为 PNG 图片
- **支持的标的**: S&P 500、Russell 2000、纳斯达克期货、黄金期货、EUR/USD、BTC 等
- **对我们的启发**:
  - ✅ "累计平均收益曲线"是一个简洁的可视化方式，但只适合 PC 端大图展示
  - ❌ 纯静态图片，无交互
  - ❌ 不支持 A 股（依赖 Yahoo Finance，A 股数据质量差）
  - ❌ 没有区分特殊窗口（春节、两会等），只是全年平滑曲线
- **我们的差异化**: 我们按 A 股特定事件窗口分开展示，信息密度更高

#### 2. handiko/Monthly-Seasonality-Trading-Strategy-Backtest

- **GitHub**: https://github.com/handiko/Monthly-Seasonality-Trading-Strategy-Backtest
- **语言**: Python
- **Stars**: 3
- **做什么**: 基于月度季节性回测交易策略
- **核心方法**:
  - 用户指定"买入月"和"卖出月"（如 12 月买入、4 月卖出）
  - 用 Yahoo Finance 历史数据模拟交易
  - 与 Buy & Hold 基准对比，输出累计收益曲线
- **对我们的启发**:
  - ✅ "买N月卖N月"的思路可以验证我们的月度概率是否有交易价值
  - ❌ 纯回测工具，不是展示型产品
  - ❌ 无前端，无 API
- **我们的差异化**: 我们是展示型产品，不做回测

#### 3. ranaroussi/quantstats

- **GitHub**: https://github.com/ranaroussi/quantstats
- **语言**: Python
- **Stars**: 7k+
- **做什么**: 量化投资组合分析工具，提供全面的绩效分析和可视化
- **与我们相关的功能**:
  - `qs.plots.monthly_heatmap()` — 月度收益热力图（年 × 月，颜色映射收益率）
  - `qs.stats.monthly_returns()` — 月度收益率统计表
  - `qs.reports.html()` — 生成完整的 HTML 报告（含月度热力图）
- **核心实现**:
  - 用 pandas 的 `resample('M')` 聚合日线到月线
  - 热力图用 seaborn 的 `heatmap()` 绘制
  - HTML 报告用 Jinja2 模板渲染
- **对我们的启发**:
  - ✅ "年 × 月"热力图是经典可视化方式，直观展示哪些年份的哪些月份表现好
  - ✅ 可以借鉴其月度统计的计算逻辑（`resample` + `pct_change`）
  - ❌ 面向量化从业者，不是普通投资者
  - ❌ Python 库，不能直接用于 Web 前端
- **我们的差异化**: 我们面向普通投资者，移动端优先，不要求用户会写 Python

#### 4. epfl-ada/ada-2025-project (Calendar Effects in Stock Market)

- **GitHub**: https://github.com/epfl-ada/ada-2025-project-farzmcollective2025
- **语言**: Python (学术项目)
- **做什么**: EPFL 数据科学课程项目，研究股票市场日历效应
- **研究的效应**:
  - Half-Month Effect（半月效应：月上半月 vs 月下半月）
  - Halloween Effect（"Sell in May" 效应：5-10 月 vs 11-4 月）
  - Turn-of-Month Effect
  - 检验这些效应在不同子时期是否仍然成立
- **对我们的启发**:
  - ✅ 他们用了统计检验（t-test、bootstrap）来验证效应显著性，比我们简单的上涨概率更严谨
  - ✅ 按子时期分析（如 2000-2010 vs 2010-2020）可以看出效应是否衰退
  - ❌ 学术项目，无产品化
- **我们可以借鉴的**: 未来可以在脚本中加入统计显著性检验（t-test p-value），写入 JSON 的 `confidence` 字段

### C.2 间接相关项目（A 股看板/量化工具）

#### 5. chengzuopeng/stock-dashboard

- **GitHub**: https://github.com/chengzuopeng/stock-dashboard
- **语言**: React 19 + TypeScript
- **Stars**: 35
- **做什么**: A 股数据看板，支持热力图、板块/行业视图、个股详情
- **与我们相关的功能**:
  - 热力图页面 `/heatmap`：按行业/板块/自选维度查看市场热度
  - 技术栈与我们类似（TypeScript + Vite），但用 React 而非 Vue
  - 数据来自 stock-sdk（封装了东方财富等数据源）
- **对我们的启发**:
  - ✅ 热力图用 ECharts 实现，视觉效果不错
  - ✅ 证明了"前端 + 数据 API"的架构在 A 股领域可行
  - ❌ 没有日历效应功能，主要做实时行情
- **我们可以借鉴的**: ECharts 热力图组件可以作为未来"月度热力图"的技术选型

#### 6. khscience/OSkhQuant（看海量化）

- **GitHub**: https://github.com/khscience/OSkhQuant
- **语言**: Python
- **做什么**: 量化回测系统，含月度收益热力图
- **与我们相关的功能**:
  - 月度收益热力图：形如日历，用颜色冷暖展示策略在不同年份和月份的收益
  - "通过它可以快速发现策略是否存在周期性或市场依赖性"
- **对我们的启发**:
  - ✅ 热力图的颜色映射方式（绿赚红亏，符合中国股市习惯）
  - ❌ 面向量化策略评估，不是面向普通投资者
- **我们可以借鉴的**: 颜色方案（红涨绿跌 vs 红跌绿涨——中国股市习惯是红涨绿跌）

### C.3 可视化库参考

#### 7. ts-kontakt/tabheatcal

- **GitHub**: https://github.com/ts-kontakt/tabheatcal
- **语言**: Python
- **做什么**: 日历热力图可视化模块
- **特色**: 交互式热力图，支持 hover 查看数值，适合展示时间序列数据
- **对我们的启发**: 如果未来要在前端做热力图，可以参考其布局方式

#### 8. neenza/r-calendar-heatmaps

- **GitHub**: https://github.com/neenza/r-calendar-heatmaps
- **语言**: R
- **做什么**: 金融收益率日历热力图
- **特色**: 按"周 × 星期"布局，类似 GitHub 贡献图
- **对我们的启发**: GitHub 风格的日历热力图在金融领域有应用，但更适合作为"年度回顾"展示

### C.4 竞品分析总结

| 项目 | 做什么 | 展示方式 | 数据源 | 前端 | 与我们定位对比 |
|------|--------|----------|--------|------|----------------|
| Market-Seasonality-Chart | 季节性曲线图 | 静态 PNG | Yahoo Finance | ❌ 无 | 海外标的为主，不支持 A 股特殊事件 |
| Monthly-Seasonality-Backtest | 月度回测 | 收益曲线图 | Yahoo Finance | ❌ 无 | 工具型，不是展示型 |
| QuantStats | 投资组合分析 | HTML 报告 + 热力图 | yfinance | ❌ 本地生成 | 面向量化从业者 |
| EPFL 学术项目 | 日历效应研究 | 学术图表 | 自定义 | ❌ 无 | 有统计检验方法可借鉴 |
| stock-dashboard | A 股看板 | React SPA + ECharts | stock-sdk | ✅ 有 | 无日历效应，做实时行情 |
| OSkhQuant | 量化回测 | 月度热力图 | 自定义 | ❌ 本地 | 面向策略评估 |

### C.5 关键发现

**没有发现一个项目同时满足以下所有需求：**

1. 专注 A 股市场
2. 展示日历效应（而非实时行情）
3. 有 Web 前端（移动端友好）
4. 面向普通投资者（非量化从业者）
5. 与"事件风险"信息整合展示

**这验证了我们项目的差异化定位：** 不是一个量化工具，而是一个面向普通投资者的"日历效应 + 事件风险"信息聚合页面。

### C.6 可借鉴的具体做法

| 借鉴来源 | 借鉴内容 | 我们怎么用 |
|----------|----------|------------|
| Market-Seasonality-Chart | 累计平均收益曲线 | V2 可选：在月度概率条旁加一条迷你曲线 |
| QuantStats | 月度收益热力图（年 × 月） | V2 可选：独立的"年度热力图"页面 |
| QuantStats | `resample` + 月度统计计算逻辑 | Python 生成脚本直接复用 |
| EPFL 项目 | 统计显著性检验 (t-test) | 在脚本中加入 p-value 计算，写入 `confidence` |
| EPFL 项目 | 子时期对比（效应是否衰退） | V2 可选：展示"近 10 年 vs 近 20 年"对比 |
| stock-dashboard | ECharts 热力图组件 | V2 如果做热力图页，复用其 ECharts 方案 |
| OSkhQuant | 颜色方案（红涨绿跌） | 直接采用，符合中国股市习惯 |

### C.7 我们的优势

1. **唯一专注 A 股日历效应的 Web 产品**——填补空白
2. **事件风险 + 日历效应整合**——其他项目都是分开的
3. **移动端优先**——QuantStats 等工具都是桌面端
4. **零成本部署**——Cloudflare 免费套餐
5. **低维护**——静态 JSON，年度更新，不需要实时数据
