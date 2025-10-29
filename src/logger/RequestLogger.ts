/**
 * AI请求日志记录器
 * 记录所有AI请求和响应到本地文件，方便调试和分析
 *
 * 注意：在SiYuan Electron环境中，使用window.require访问Node.js fs模块
 */

// 获取Node.js fs模块（在Electron环境中可用）
declare global {
    interface Window {
        require?: NodeRequire;
    }
}

/**
 * 日志条目接口
 */
export interface LogEntry {
    /** 时间戳 (ISO 8601) */
    timestamp: string;
    /** 请求唯一ID */
    requestId: string;
    /** 功能来源 (Chat, QuickEdit, AIEditProcessor) */
    feature: string;
    /** 请求内容 */
    request: {
        model: string;
        temperature: number;
        max_tokens: number;
        system?: string;
        messages: Array<{
            role: string;
            content: string;
        }>;
    };
    /** 响应内容 (可选) */
    response?: {
        content: string;
        stop_reason?: string;
        usage?: {
            input_tokens: number;
            output_tokens: number;
        };
    };
    /** 性能统计 */
    performance: {
        duration_ms: number;
        started_at: string;
        completed_at: string;
    };
    /** 配置信息 (脱敏) */
    config: {
        apiKey: string;  // 已脱敏
        baseURL: string;
    };
}

/**
 * RequestLogger 类
 * 负责将AI请求和响应写入日志文件
 */
export class RequestLogger {
    private enabled: boolean = false;
    private logPath: string = '';
    private includeResponse: boolean = true;

    constructor() {
        console.log('[RequestLogger] Initialized');
    }

    /**
     * 配置日志记录器
     */
    configure(enabled: boolean, logPath: string, includeResponse: boolean = true): void {
        this.enabled = enabled;
        this.logPath = logPath;
        this.includeResponse = includeResponse;

        if (this.enabled && this.logPath) {
            console.log(`[RequestLogger] Enabled, logging to: ${this.logPath}`);
            this.ensureLogDirectory();
        } else {
            console.log('[RequestLogger] Disabled');
        }
    }

    /**
     * 确保日志目录存在
     * 在SiYuan环境中，目录创建由用户手动完成或在首次写入时自动处理
     */
    private async ensureLogDirectory(): Promise<void> {
        // 在SiYuan环境中，我们依赖用户提供有效的目录路径
        // 如果目录不存在，首次写入时会失败并提示用户
        console.log(`[RequestLogger] Using log directory: ${this.logPath}`);
    }

    /**
     * 写入日志条目
     * 使用Node.js fs模块（通过window.require）
     */
    async writeLog(logEntry: LogEntry): Promise<void> {
        if (!this.enabled || !this.logPath) {
            return;
        }

        try {
            // 如果不包含响应，移除响应字段
            if (!this.includeResponse) {
                delete logEntry.response;
            }

            const fileName = this.getLogFileName();
            const logLine = JSON.stringify(logEntry, null, 2) + '\n---\n';  // 添加分隔符

            // 在Electron环境中使用Node.js fs模块
            if (typeof window !== 'undefined' && window.require) {
                const fs = window.require('fs');
                const path = window.require('path');

                const filePath = path.join(this.logPath, fileName);

                // 确保目录存在
                if (!fs.existsSync(this.logPath)) {
                    console.log(`[RequestLogger] Creating directory: ${this.logPath}`);
                    fs.mkdirSync(this.logPath, { recursive: true });
                }

                // 追加写入文件
                fs.appendFileSync(filePath, logLine, 'utf-8');
                console.log(`[RequestLogger] ✅ Log written to ${filePath}`);
            } else {
                console.error('[RequestLogger] ❌ Node.js fs module not available (not in Electron environment)');
                this.enabled = false;  // 禁用日志功能
            }
        } catch (error) {
            console.error('[RequestLogger] ❌ Failed to write log:', error);
            console.error('[RequestLogger] Error details:', {
                message: error instanceof Error ? error.message : String(error),
                logPath: this.logPath,
                enabled: this.enabled
            });
            // 静默失败，不影响主功能
        }
    }

    /**
     * 生成日志文件名 (按日期)
     */
    private getLogFileName(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `ai-requests-${year}-${month}-${day}.log`;
    }

    /**
     * API Key 脱敏
     * 显示前7位和后4位，中间用****代替
     */
    static maskApiKey(apiKey: string): string {
        if (!apiKey || apiKey.length < 12) {
            return '****';
        }
        const prefix = apiKey.substring(0, 7);
        const suffix = apiKey.substring(apiKey.length - 4);
        return `${prefix}****${suffix}`;
    }

    /**
     * 生成唯一请求ID
     */
    static generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * 是否已启用
     */
    isEnabled(): boolean {
        return this.enabled;
    }
}
