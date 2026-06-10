#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日历效应统计数据生成脚本

使用 AKShare 获取上证指数历史日线数据，计算：
1. 月度统计（12 个月的上涨概率、平均涨幅等）
2. 每日统计（每月 1-31 号各自的上涨概率）
3. 输出到 worker/data/calendar-effects.json

运行频率：每年 1 月运行一次
"""

import calendar
import io
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# 强制 UTF-8 输出（Windows 兼容）
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import akshare as ak
import pandas as pd
import numpy as np


class NumpyEncoder(json.JSONEncoder):
    """处理 numpy 类型的 JSON 编码器"""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        elif isinstance(obj, (np.floating,)):
            return float(obj)
        elif isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        return super().default(obj)


# 配置
INDICES = [
    {"code": "sh000001", "name": "上证指数", "short_code": "000001"},
    {"code": "sh000300", "name": "沪深300", "short_code": "000300"},
    {"code": "sh000905", "name": "中证500", "short_code": "000905"},
]
YEARS = 20  # 统计年限
OUTPUT_FILE = Path(__file__).parent.parent / "worker" / "data" / "calendar-effects.json"

# 特殊窗口定义
SPECIAL_WINDOWS = [
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
                "tip": "节前资金面偏紧但情绪偏乐观"
            },
            {
                "name": "春节后",
                "offset_days": 5,
                "offset_unit": "trading_day",
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
        "date_range": {"start": "03-01", "end": "03-20"},
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
            {"start": -1, "end": 3, "description": "月末最后1日 + 下月前3日"}
        ],
        "description": "月末月初资金面偏松，收益率显著高于月内其他时段",
        "confidence": 4
    },
    {
        "key": "golden_october",
        "name": "红十月",
        "icon": "🍂",
        "type": "fixed_date_range",
        "date_range": {"start": "10-01", "end": "10-15"},
        "description": "国庆后资金回流，历史表现偏强",
        "confidence": 4
    }
]

# 春节日期预计算表（2006-2035）
SPRING_FESTIVAL_DATES = {
    "2006": "2006-01-29",
    "2007": "2007-02-18",
    "2008": "2008-02-07",
    "2009": "2009-01-26",
    "2010": "2010-02-14",
    "2011": "2011-02-03",
    "2012": "2012-01-23",
    "2013": "2013-02-10",
    "2014": "2014-01-31",
    "2015": "2015-02-19",
    "2016": "2016-02-08",
    "2017": "2017-01-28",
    "2018": "2018-02-16",
    "2019": "2019-02-05",
    "2020": "2020-01-25",
    "2021": "2021-02-12",
    "2022": "2022-02-01",
    "2023": "2023-01-22",
    "2024": "2024-02-10",
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


def fetch_data(index_config):
    """获取指定指数的历史日线数据"""
    code = index_config["code"]
    name = index_config["name"]
    print(f"\n正在获取 {name} ({code}) 历史数据...")

    # 计算时间范围
    end_date = datetime.now()
    start_date = end_date - timedelta(days=YEARS * 365)

    start_str = start_date.strftime("%Y%m%d")
    end_str = end_date.strftime("%Y%m%d")

    try:
        # 使用 AKShare 获取指数日线数据
        df = ak.stock_zh_index_daily(symbol=code)
        print(f"获取到 {len(df)} 条日线数据")
    except Exception as e:
        print(f"获取数据失败: {e}")
        return None

    # 清理数据
    df['date'] = pd.to_datetime(df['date'])
    df = df[df['date'] >= start_date]
    df = df[df['date'] <= end_date]
    df = df.sort_values('date').reset_index(drop=True)

    # 计算涨跌幅
    df['change_pct'] = df['close'].pct_change() * 100
    df = df.dropna(subset=['change_pct'])

    # 添加日期特征
    df['year'] = df['date'].dt.year
    df['month'] = df['date'].dt.month
    df['day_of_month'] = df['date'].dt.day
    df['is_up'] = df['change_pct'] > 0

    print(f"统计区间: {df['date'].min().strftime('%Y-%m-%d')} 至 {df['date'].max().strftime('%Y-%m-%d')}")
    print(f"有效交易日: {len(df)} 天")
    print(f"统计年限: {df['year'].max() - df['year'].min() + 1} 年")

    return df


def calc_monthly_stats(df):
    """计算月度统计（含波动率、衰减检测、连涨跌）"""
    print("正在计算月度统计...")

    current_year = df['year'].max()

    # 计算每月收益率（用于月间波动率）
    monthly_returns = df.groupby([df['date'].dt.year, df['date'].dt.month])['change_pct'].sum()
    monthly_returns.index = monthly_returns.index.set_names(['year', 'month'])

    monthly_data = []
    for month in range(1, 13):
        month_df = df[df['month'] == month]
        sample_count = len(month_df)

        if sample_count == 0:
            continue

        up_count = int(month_df['is_up'].sum())
        up_probability = round(up_count / sample_count, 4)
        avg_change_pct = round(month_df['change_pct'].mean(), 2)
        median_change_pct = round(month_df['change_pct'].median(), 2)
        max_gain_pct = round(month_df['change_pct'].max(), 2)
        max_loss_pct = round(month_df['change_pct'].min(), 2)

        # 波动率（月收益率在各年之间的标准差）
        month_yearly = monthly_returns.xs(month, level='month')
        volatility = round(month_yearly.std(), 2) if len(month_yearly) > 1 else 0

        # 标签
        labels = {
            2: "春季躁动",
            3: "两会震荡",
            4: "财报雷期",
            7: "七翻身",
            10: "红十月"
        }

        # 衰减检测：近 5 年 / 近 10 年 vs 全样本
        recent_5y = month_df[month_df['year'] >= current_year - 4]
        recent_10y = month_df[month_df['year'] >= current_year - 9]

        decay = {}
        if len(recent_5y) > 0:
            decay["recent_5y"] = {
                "up_probability": round(recent_5y['is_up'].mean(), 4),
                "avg_change_pct": round(recent_5y['change_pct'].mean(), 2),
                "sample_count": len(recent_5y)
            }
        if len(recent_10y) > 0:
            decay["recent_10y"] = {
                "up_probability": round(recent_10y['is_up'].mean(), 4),
                "avg_change_pct": round(recent_10y['change_pct'].mean(), 2),
                "sample_count": len(recent_10y)
            }

        # 连涨/连跌天数统计（按年月分组，每月内独立计算，再跨年平均）
        streaks = calc_monthly_streaks(month_df)

        # 置信度（简化：基于样本量和概率偏离50%的程度）
        deviation = abs(up_probability - 0.5)
        if deviation > 0.15 and sample_count > 200:
            confidence = 5
        elif deviation > 0.10 and sample_count > 150:
            confidence = 4
        elif deviation > 0.05 and sample_count > 100:
            confidence = 3
        elif deviation > 0.02:
            confidence = 2
        else:
            confidence = 1

        monthly_data.append({
            "month": month,
            "sample_count": sample_count,
            "up_count": up_count,
            "up_probability": up_probability,
            "avg_change_pct": avg_change_pct,
            "median_change_pct": median_change_pct,
            "max_gain_pct": max_gain_pct,
            "max_loss_pct": max_loss_pct,
            "volatility": volatility,
            "decay": decay,
            "streaks": streaks,
            "label": labels.get(month),
            "confidence": confidence
        })

    return monthly_data


def calc_streaks(df):
    """计算连涨/连跌天数统计（基于已排序的连续交易日序列）"""
    if len(df) == 0:
        return {"avg_up_streak": 0, "avg_down_streak": 0, "max_up_streak": 0, "max_down_streak": 0}

    is_up = (df['change_pct'] > 0).values
    up_streaks = []
    down_streaks = []
    current_streak = 1

    for i in range(1, len(is_up)):
        if is_up[i] == is_up[i - 1]:
            current_streak += 1
        else:
            if is_up[i - 1]:
                up_streaks.append(current_streak)
            else:
                down_streaks.append(current_streak)
            current_streak = 1

    # 最后一段
    if is_up[-1]:
        up_streaks.append(current_streak)
    else:
        down_streaks.append(current_streak)

    return {
        "avg_up_streak": round(np.mean(up_streaks), 1) if up_streaks else 0,
        "avg_down_streak": round(np.mean(down_streaks), 1) if down_streaks else 0,
        "max_up_streak": int(max(up_streaks)) if up_streaks else 0,
        "max_down_streak": int(max(down_streaks)) if down_streaks else 0
    }


def calc_monthly_streaks(month_df):
    """按月内独立计算连涨连跌（每年该月内分别计算），再跨年平均。

    避免跨月断裂问题：1月31日和2月1日属于不同月份，不应该连起来算。
    """
    if len(month_df) == 0:
        return {"avg_up_streak": 0, "avg_down_streak": 0, "max_up_streak": 0, "max_down_streak": 0}

    all_up_streaks = []
    all_down_streaks = []

    # 按年月分组，每月内独立计算
    for ym, group in month_df.groupby(month_df['date'].dt.to_period('M')):
        group = group.sort_values('date')
        if len(group) == 0:
            continue

        is_up = (group['change_pct'] > 0).values
        current_streak = 1

        for i in range(1, len(is_up)):
            if is_up[i] == is_up[i - 1]:
                current_streak += 1
            else:
                if is_up[i - 1]:
                    all_up_streaks.append(current_streak)
                else:
                    all_down_streaks.append(current_streak)
                current_streak = 1

        # 最后一段
        if len(is_up) > 0:
            if is_up[-1]:
                all_up_streaks.append(current_streak)
            else:
                all_down_streaks.append(current_streak)

    return {
        "avg_up_streak": round(np.mean(all_up_streaks), 1) if all_up_streaks else 0,
        "avg_down_streak": round(np.mean(all_down_streaks), 1) if all_down_streaks else 0,
        "max_up_streak": int(max(all_up_streaks)) if all_up_streaks else 0,
        "max_down_streak": int(max(all_down_streaks)) if all_down_streaks else 0
    }


def calc_spring_festival_stats(df, spring_dates):
    """计算春节前后实际涨跌统计"""
    print("正在计算春节效应实际数据...")

    results = {"yearly": [], "aggregate": {}}
    pre_5d_changes = []
    post_5d_changes = []

    for year_str, festival_date_str in spring_dates.items():
        year = int(year_str)
        festival_date = pd.Timestamp(festival_date_str)

        # 获取春节前 5 个交易日
        pre_mask = (df['date'] < festival_date) & (df['date'] >= festival_date - pd.Timedelta(days=15))
        pre_df = df[pre_mask].tail(5)

        # 获取春节后 5 个交易日
        post_mask = (df['date'] > festival_date) & (df['date'] <= festival_date + pd.Timedelta(days=15))
        post_df = df[post_mask].head(5)

        pre_change = round(pre_df['change_pct'].sum(), 2) if len(pre_df) > 0 else None
        post_change = round(post_df['change_pct'].sum(), 2) if len(post_df) > 0 else None

        if pre_change is not None:
            pre_5d_changes.append(pre_change)
        if post_change is not None:
            post_5d_changes.append(post_change)

        results["yearly"].append({
            "year": year,
            "festival_date": festival_date_str,
            "pre_5d_change_pct": pre_change,
            "post_5d_change_pct": post_change
        })

    # 汇总统计
    if pre_5d_changes:
        results["aggregate"]["pre_5d"] = {
            "up_count": sum(1 for c in pre_5d_changes if c > 0),
            "total": len(pre_5d_changes),
            "up_probability": round(sum(1 for c in pre_5d_changes if c > 0) / len(pre_5d_changes), 4),
            "avg_change_pct": round(np.mean(pre_5d_changes), 2)
        }

    if post_5d_changes:
        results["aggregate"]["post_5d"] = {
            "up_count": sum(1 for c in post_5d_changes if c > 0),
            "total": len(post_5d_changes),
            "up_probability": round(sum(1 for c in post_5d_changes if c > 0) / len(post_5d_changes), 4),
            "avg_change_pct": round(np.mean(post_5d_changes), 2)
        }

    return results


def calc_turn_of_month_stats(df):
    """计算月末效应实际数据（每月最后 2 个交易日 + 下月前 3 个交易日）"""
    print("正在计算月末效应实际数据...")

    df = df.copy()

    # 按年月分组，标记每月最后 2 个交易日和最初 3 个交易日
    df['ym'] = df['date'].dt.to_period('M')
    window_indices = set()

    for ym, group in df.groupby('ym'):
        group = group.sort_values('date')
        # 每月最后 2 个交易日
        last_2 = group.tail(2).index.tolist()
        # 每月最初 3 个交易日
        first_3 = group.head(3).index.tolist()
        window_indices.update(last_2)
        window_indices.update(first_3)

    window_df = df[df.index.isin(window_indices)]
    non_window_df = df[~df.index.isin(window_indices)]

    result = {}
    if len(window_df) > 0:
        result["window"] = {
            "sample_count": len(window_df),
            "up_probability": round(window_df['is_up'].mean(), 4),
            "avg_change_pct": round(window_df['change_pct'].mean(), 2)
        }
    if len(non_window_df) > 0:
        result["non_window"] = {
            "sample_count": len(non_window_df),
            "up_probability": round(non_window_df['is_up'].mean(), 4),
            "avg_change_pct": round(non_window_df['change_pct'].mean(), 2)
        }

    if len(window_df) > 0 and len(non_window_df) > 0:
        result["premium"] = {
            "up_probability_diff": round(result["window"]["up_probability"] - result["non_window"]["up_probability"], 4),
            "avg_change_diff_pct": round(result["window"]["avg_change_pct"] - result["non_window"]["avg_change_pct"], 2)
        }

    return result


def calc_two_sessions_stats(df):
    """计算两会效应实际数据（3月5日-3月11日左右）"""
    print("正在计算两会效应实际数据...")

    # 会前 2 周：2月19日-3月4日
    # 会中：3月5日-3月15日
    # 会后 1 月：3月16日-4月15日

    pre_mask = ((df['month'] == 2) & (df['day_of_month'] >= 19)) | ((df['month'] == 3) & (df['day_of_month'] <= 4))
    during_mask = (df['month'] == 3) & (df['day_of_month'] >= 5) & (df['day_of_month'] <= 15)
    post_mask = ((df['month'] == 3) & (df['day_of_month'] >= 16)) | ((df['month'] == 4) & (df['day_of_month'] <= 15))

    result = {}

    for name, mask in [("pre", pre_mask), ("during", during_mask), ("post", post_mask)]:
        subset = df[mask]
        if len(subset) > 0:
            result[name] = {
                "sample_count": len(subset),
                "up_probability": round(subset['is_up'].mean(), 4),
                "avg_change_pct": round(subset['change_pct'].mean(), 2)
            }

    return result


def calc_earnings_season_stats(df):
    """计算财报季实际数据（4月/8月/10月）"""
    print("正在计算财报季实际数据...")

    result = {}
    for month, name in [(4, "q1_annual"), (8, "h1"), (10, "q3")]:
        month_df = df[df['month'] == month]
        if len(month_df) > 0:
            result[name] = {
                "month": month,
                "sample_count": len(month_df),
                "up_probability": round(month_df['is_up'].mean(), 4),
                "avg_change_pct": round(month_df['change_pct'].mean(), 2),
                "volatility": round(month_df['change_pct'].std(), 2)
            }

    return result


def build_index_comparison(all_index_data):
    """构建三指数对比数据"""
    print("正在构建指数对比数据...")

    comparison = {}
    for month in range(1, 13):
        month_comp = {"month": month}
        for index_config, df, monthly_data, daily_data in all_index_data:
            short_code = index_config["short_code"]
            # 从 monthly_data 中找对应月份
            for m in monthly_data:
                if m["month"] == month:
                    month_comp[short_code] = {
                        "name": index_config["name"],
                        "up_probability": m["up_probability"],
                        "avg_change_pct": m["avg_change_pct"]
                    }
                    break
        comparison[str(month)] = month_comp

    return comparison


def calc_daily_by_month(df):
    """计算每日统计（每月1-31号各自的涨跌概率）"""
    print("正在计算每日统计...")

    daily_data = {}
    for month in range(1, 13):
        month_df = df[df['month'] == month]
        month_days = []

        # 获取该月最大天数
        max_day = calendar.monthrange(2024, month)[1]  # 用2024年判断（闰年）

        for day in range(1, max_day + 1):
            day_df = month_df[month_df['day_of_month'] == day]
            sample_count = len(day_df)

            if sample_count == 0:
                # 该月没有这个日期（如2月30日）
                continue

            up_count = int(day_df['is_up'].sum())
            up_probability = round(up_count / sample_count, 4)
            avg_change_pct = round(day_df['change_pct'].mean(), 2)

            month_days.append({
                "day": day,
                "sample_count": sample_count,
                "up_probability": up_probability,
                "avg_change_pct": avg_change_pct
            })

        daily_data[str(month)] = month_days

    return daily_data


def build_output(all_index_data, special_stats, index_comparison):
    """构建输出 JSON（支持多指数 + 特殊效应实际数据）"""
    print("\n正在构建输出文件...")

    output = {
        "version": datetime.now().strftime("%Y"),
        "updated_at": datetime.now().strftime("%Y-%m-%d"),
        "description": "A股日历效应统计数据，用于风险榜辅助展示",
        "disclaimer": "历史统计不代表未来表现，仅供参考",
        "indices": [],
        "monthly": {},
        "daily_by_month": {},
        "special_windows": SPECIAL_WINDOWS,
        "spring_festival_dates": SPRING_FESTIVAL_DATES,
        "special_effect_stats": special_stats,
        "index_comparison": index_comparison
    }

    for index_config, df, monthly_data, daily_data in all_index_data:
        short_code = index_config["short_code"]
        name = index_config["name"]
        years = int(df['year'].max() - df['year'].min() + 1)
        data_start = df['date'].min().strftime("%Y-%m-%d")
        data_end = df['date'].max().strftime("%Y-%m-%d")

        output["indices"].append({
            "code": short_code,
            "name": name,
            "years": years,
            "data_start": data_start,
            "data_end": data_end
        })

        output["monthly"][short_code] = {
            "name": name,
            "years": years,
            "data": monthly_data
        }

        output["daily_by_month"][short_code] = {
            "name": name,
            "years": years,
            "description": "每月1-31号的历史涨跌概率",
            "data": daily_data
        }

    return output


def main():
    print("=" * 60)
    print("日历效应统计数据生成脚本")
    print("=" * 60)

    all_index_data = []

    for index_config in INDICES:
        name = index_config["name"]
        code = index_config["code"]

        # 1. 获取数据
        df = fetch_data(index_config)
        if df is None:
            print(f"[WARN] 跳过 {name}: 数据获取失败")
            continue

        # 2. 计算月度统计
        print(f"正在计算 {name} 月度统计...")
        monthly_data = calc_monthly_stats(df)

        # 3. 计算每日统计
        print(f"正在计算 {name} 每日统计...")
        daily_data = calc_daily_by_month(df)

        all_index_data.append((index_config, df, monthly_data, daily_data))

    if not all_index_data:
        print("[ERROR] 所有指数数据获取失败")
        sys.exit(1)

    # 4. 计算特殊效应实际数据（用上证指数）
    primary_df = all_index_data[0][1]  # 上证指数的 df
    special_stats = {
        "spring_festival": calc_spring_festival_stats(primary_df, SPRING_FESTIVAL_DATES),
        "turn_of_month": calc_turn_of_month_stats(primary_df),
        "two_sessions": calc_two_sessions_stats(primary_df),
        "earnings_season": calc_earnings_season_stats(primary_df)
    }

    # 5. 构建指数对比数据
    index_comparison = build_index_comparison(all_index_data)

    # 6. 构建输出
    output = build_output(all_index_data, special_stats, index_comparison)

    # 7. 写入文件
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2, cls=NumpyEncoder)

    print(f"\n[OK] 数据已写入: {OUTPUT_FILE}")
    print(f"   文件大小: {OUTPUT_FILE.stat().st_size / 1024:.1f} KB")
    print(f"   包含指数: {len(all_index_data)} 个")

    # 打印每个指数的摘要
    for index_config, df, monthly_data, daily_data in all_index_data:
        name = index_config["name"]
        print(f"\n{'=' * 60}")
        print(f"{name} 月度统计摘要")
        print("=" * 60)
        print(f"{'月份':<6}{'上涨概率':<10}{'平均涨跌':<10}{'波动率':<8}{'标签'}")
        print("-" * 50)
        for m in monthly_data:
            label = m.get('label') or ''
            print(f"{m['month']}月    {m['up_probability']:.1%}    {m['avg_change_pct']:+.2f}%    {m['volatility']:.2f}%    {label}")

    # 打印特殊效应摘要
    print(f"\n{'=' * 60}")
    print("特殊效应实际数据摘要（上证指数）")
    print("=" * 60)

    sf = special_stats["spring_festival"]
    if "aggregate" in sf:
        agg = sf["aggregate"]
        if "pre_5d" in agg:
            p = agg["pre_5d"]
            print(f"春节前5日: 上涨概率 {p['up_probability']:.1%}, 平均涨跌 {p['avg_change_pct']:+.2f}% (N={p['total']})")
        if "post_5d" in agg:
            p = agg["post_5d"]
            print(f"春节后5日: 上涨概率 {p['up_probability']:.1%}, 平均涨跌 {p['avg_change_pct']:+.2f}% (N={p['total']})")

    tom = special_stats["turn_of_month"]
    if "premium" in tom:
        prem = tom["premium"]
        print(f"月末效应溢价: 上涨概率差 {prem['up_probability_diff']:+.1%}, 平均涨跌差 {prem['avg_change_diff_pct']:+.2f}%")

    ts = special_stats["two_sessions"]
    for phase in ["pre", "during", "post"]:
        if phase in ts:
            p = ts[phase]
            print(f"两会{phase}: 上涨概率 {p['up_probability']:.1%}, 平均涨跌 {p['avg_change_pct']:+.2f}%")


if __name__ == "__main__":
    main()
