/**
 * 数据填充脚本 - 向 D1 写入未来 7 天的测试数据
 *
 * 用途：开发阶段没有 API Key 时，用真实事件数据填充数据库
 * 数据来源：已知固定发布日期的宏观事件
 *
 * 运行方式：
 *   npx wrangler d1 execute daily-risk --file=src/seed.sql --remote
 */

// 生成未来 7 天的种子数据 SQL
function generateSeedSQL(): string {
  const lines: string[] = [];

  // 计算未来 7 天的日期
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split('T')[0]);
  }

  // 定义已知固定时间的事件模板
  // 实际项目中这些数据来自 collector，这里用硬编码做开发测试
  const eventTemplates = [
    // 美国事件 - 固定北京时间
    { key: 'US_CPI', name: '美国CPI', time: '20:30', country: 'US', score: 10, impact: 'NASDAQ,GOLD,USD,US10Y', source: 'fred', prev: '2.8%' },
    { key: 'US_PPI', name: '美国PPI', time: '20:30', country: 'US', score: 7, impact: 'NASDAQ,GOLD', source: 'fred', prev: '2.4%' },
    { key: 'US_NONFARM', name: '美国非农就业', time: '20:30', country: 'US', score: 10, impact: 'NASDAQ,GOLD,USD', source: 'fred', prev: '187K' },
    { key: 'US_UNEMPLOYMENT', name: '美国失业率', time: '20:30', country: 'US', score: 9, impact: 'NASDAQ,USD', source: 'fred', prev: '4.0%' },
    { key: 'US_GDP', name: '美国GDP', time: '20:30', country: 'US', score: 8, impact: 'NASDAQ,USD', source: 'fred', prev: '3.2%' },
    { key: 'US_FOMC_RATE', name: 'FOMC利率决议', time: '02:00', country: 'US', score: 10, impact: 'NASDAQ,GOLD,USD,全市场', source: 'fred', prev: '5.25-5.50%' },

    // 中国事件 - 固定北京时间
    { key: 'CN_CPI', name: '中国CPI', time: '09:30', country: 'CN', score: 8, impact: '上证,恒指,CNY', source: 'manual', prev: '0.2%' },
    { key: 'CN_PPI', name: '中国PPI', time: '09:30', country: 'CN', score: 6, impact: '上证,商品', source: 'manual', prev: '-2.5%' },
    { key: 'CN_PMI', name: '中国PMI', time: '09:30', country: 'CN', score: 7, impact: '上证,恒指,铁矿石', source: 'manual', prev: '50.2' },
    { key: 'CN_M2', name: '中国M2货币供应', time: '10:00', country: 'CN', score: 6, impact: '上证,CNY', source: 'manual', prev: '8.6%' },

    // 财报 - 盘后
    { key: 'NVDA_EARNINGS', name: 'NVDA财报', time: '盘后', country: 'US', score: 8, impact: 'NASDAQ,半导体,TSM', source: 'alpha_vantage', prev: null },
    { key: 'AAPL_EARNINGS', name: 'AAPL财报', time: '盘后', country: 'US', score: 7, impact: 'NASDAQ,消费电子', source: 'alpha_vantage', prev: null },
    { key: 'TSLA_EARNINGS', name: 'TSLA财报', time: '盘后', country: 'US', score: 6, impact: 'NASDAQ,电动车', source: 'alpha_vantage', prev: null },
  ];

  // 按日期分配事件（模拟真实分布）
  const schedule: Record<number, number[]> = {
    0: [6, 7],        // 今天: 中国CPI, PPI
    1: [0, 10, 11],   // 明天: 美国CPI, NVDA财报, AAPL财报
    2: [8],           // 后天: 中国PMI
    3: [5],           // FOMC
    4: [2, 3, 12],    // 非农 + 失业率 + TSLA
    5: [4],           // GDP
    6: [9],           // M2
  };

  lines.push('-- Daily Risk Seed Data');
  lines.push('-- Generated for development testing');
  lines.push('');

  // 清空旧数据
  lines.push('DELETE FROM events;');
  lines.push('');

  for (const [dayOffset, eventIndices] of Object.entries(schedule)) {
    const date = dates[parseInt(dayOffset)];
    if (!date) continue;

    for (const idx of eventIndices) {
      const tmpl = eventTemplates[idx];
      if (!tmpl) continue;

      // 计算 UTC 时间
      const [h, m] = tmpl.time === '盘后' ? [20, 0] : tmpl.time.split(':').map(Number);
      const localTime = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`;
      const utcTime = new Date(localTime).toISOString();

      const displayName = tmpl.name.replace(/'/g, "''");
      const impact = tmpl.impact.replace(/'/g, "''");
      const prev = tmpl.prev ? `'${tmpl.prev}'` : 'NULL';

      lines.push(`INSERT OR REPLACE INTO events (
        event_key, source, title, display_name,
        event_date, event_time, timezone, event_datetime_utc,
        country, importance, market_impact,
        previous_value, status
      ) VALUES (
        '${tmpl.key}', '${tmpl.source}', '${displayName}', '${displayName}',
        '${date}', '${tmpl.time}', 'Asia/Shanghai', '${utcTime}',
        '${tmpl.country}', ${tmpl.score}, '["${impact.replace(/,/g, '","')}"]',
        ${prev}, 'scheduled'
      );`);
    }
  }

  lines.push('');
  lines.push('-- Verify');
  lines.push('SELECT event_date, display_name, importance, previous_value FROM events ORDER BY event_date, importance DESC;');

  return lines.join('\n');
}

export { generateSeedSQL };
