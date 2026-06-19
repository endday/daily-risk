/**
 * HTTP Client — 基于 ky 的统一 HTTP 客户端
 *
 * 所有采集器共享同一个 ky 实例，统一超时和重试配置。
 * 个别采集器可以在调用时覆盖默认值。
 *
 * ky 文档：https://github.com/sindresorhus/ky
 */

import ky from 'ky';

/**
 * 预配置的 ky 实例
 *
 * 默认行为：
 * - 超时 15 秒（CF Worker CPU 限制 30s，给其他采集器留余量）
 * - 失败自动重试 2 次（共 3 次请求）
 * - 重试时指数退避
 * - 429/500/502/503/504 触发重试
 */
export const http = ky.create({
  timeout: 15_000,
  retry: {
    limit: 2,
    statusCodes: [408, 429, 500, 502, 503, 504],
    methods: ['get'],
  },
  headers: {
    'User-Agent': 'DailyRisk-Worker/1.0',
  },
});

/**
 * 带自定义配置的请求快捷方法
 *
 * 用于需要覆盖默认配置的采集器（如更长的超时、更多的重试）。
 */
export function httpRequest<T = any>(
  url: string,
  options?: {
    timeout?: number;
    retry?: number;
    searchParams?: Record<string, string | number>;
    headers?: Record<string, string>;
  },
): Promise<T> {
  return http.get(url, {
    timeout: options?.timeout,
    retry: options?.retry != null ? { limit: options.retry } : undefined,
    searchParams: options?.searchParams,
    headers: options?.headers,
  }).json<T>();
}

/**
 * 获取纯文本响应（如 HTML）
 */
export async function httpText(
  url: string,
  options?: {
    timeout?: number;
    retry?: number;
    searchParams?: Record<string, string | number>;
    headers?: Record<string, string>;
  },
): Promise<string> {
  return http.get(url, {
    timeout: options?.timeout,
    retry: options?.retry != null ? { limit: options.retry } : undefined,
    searchParams: options?.searchParams,
    headers: options?.headers,
  }).text();
}
