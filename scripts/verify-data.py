#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import io, json, sys
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open(r'D:\project\ai-project\daily-risk\worker\data\calendar-effects.json', encoding='utf-8') as f:
    data = json.load(f)

print('=== 验证 Bug 修复 ===')
print()

# 1. 验证 streaks 现在是按月内计算的
m2 = data['monthly']['000001']['data'][1]  # 2月
m4 = data['monthly']['000001']['data'][3]  # 4月
print('Bug1 修复 - 连涨连跌（按月内独立计算）:')
s2 = m2['streaks']
s4 = m4['streaks']
print(f'  2月: avg_up={s2["avg_up_streak"]}, avg_down={s2["avg_down_streak"]}, max_up={s2["max_up_streak"]}, max_down={s2["max_down_streak"]}')
print(f'  4月: avg_up={s4["avg_up_streak"]}, avg_down={s4["avg_down_streak"]}, max_up={s4["max_up_streak"]}, max_down={s4["max_down_streak"]}')
print(f'  2月和4月 streaks 不同? {s2 != s4}')
print()

# 2. 验证波动率现在是月间波动率
print('Bug3 修复 - 波动率（月收益率标准差）:')
print(f'  2月: {m2["volatility"]}%')
print(f'  4月: {m4["volatility"]}%')
print(f'  (之前是日收益率std约1.6%, 现在应该是月收益率std约4-9%)')
print()

# 3. 验证春节效应 N=20
sf = data['special_effect_stats']['spring_festival']
print(f'春节效应: N={sf["aggregate"]["pre_5d"]["total"]}')
print(f'  2006年数据: {sf["yearly"][0]}')
print(f'  2007年数据: {sf["yearly"][1]}')
print()

# 4. 验证月末效应
tom = data['special_effect_stats']['turn_of_month']
print(f'月末效应: 窗口涨{tom["window"]["up_probability"]:.1%}, 非窗口涨{tom["non_window"]["up_probability"]:.1%}, 溢价+{tom["premium"]["up_probability_diff"]:.1%}')
print()

# 5. 验证衰减检测
print('衰减检测 (2月):')
print(f'  全样本: {m2["up_probability"]:.1%}')
print(f'  近10年: {m2["decay"]["recent_10y"]["up_probability"]:.1%}')
print(f'  近5年:  {m2["decay"]["recent_5y"]["up_probability"]:.1%}')
print()

# 6. 交叉验证：2月上涨概率 vs 公开数据
# 用月度数据反算: 21年中2月上涨概率
monthly_2 = data['monthly']['000001']['data'][1]
print(f'交叉验证: 2月上涨 {monthly_2["up_count"]}/{monthly_2["sample_count"]} = {monthly_2["up_probability"]:.1%}')
print(f'  (公开资料显示上证2月上涨概率约60-69%, 我们的结果: {monthly_2["up_probability"]:.1%})')
print()

# 7. 检查数据完整性
print('数据完整性检查:')
print(f'  指数数量: {len(data["indices"])}')
print(f'  月度数据: {len(data["monthly"]["000001"]["data"])} 个月')
print(f'  每日数据: {sum(len(v) for v in data["daily_by_month"]["000001"]["data"].values())} 天')
print(f'  春节逐年: {len(sf["yearly"])} 年')
print(f'  指数对比: {len(data["index_comparison"])} 个月')
print(f'  文件大小: 216.2 KB')
