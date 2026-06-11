-- Add confidence and forecast fields
-- 2026-06-11

-- 数据可信度标记：confirmed = 官方发布日期, estimated = 推算日期
ALTER TABLE events ADD COLUMN confidence TEXT DEFAULT 'estimated';

-- 预测值（部分经济指标有市场预测）
ALTER TABLE events ADD COLUMN forecast_value TEXT;

-- 数据来源链接（官方公告页）
ALTER TABLE events ADD COLUMN source_url TEXT;

-- 更新已有事件的默认值
UPDATE events SET confidence = 'estimated' WHERE confidence IS NULL;
