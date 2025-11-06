/**
 * AI 响应内容过滤模块
 * 提供正则表达式过滤和替换功能 + 高级过滤管道
 */

export { ResponseFilter, responseFilter } from "./ResponseFilter";
export type { FilterRule, FilterResult } from "./types";
export { BUILTIN_FILTER_TEMPLATES } from "./types";

// Advanced filtering pipeline
export { FilterPipeline } from "./FilterPipeline";
export type { FilterMiddleware, FilterContext } from "./FilterPipeline";
export * from "./middleware";
