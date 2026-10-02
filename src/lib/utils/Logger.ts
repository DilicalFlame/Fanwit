import {
    trace as backendTrace,
    debug as backendDebug,
    info as backendInfo,
    warn as backendWarn,
    error as backendError,
} from "@tauri-apps/plugin-log";
import StackTrace from "stacktrace-js";

type BackendLogger = (message: string) => Promise<void>;

export class Logger {
    private readonly backend = {
        trace: backendTrace,
        debug: backendDebug,
        info: backendInfo,
        warn: backendWarn,
        error: backendError,
    };

    public trace(...args: unknown[]): void {
        void this.log(this.backend.trace, args);
    }

    public debug(...args: unknown[]): void {
        void this.log(this.backend.debug, args);
    }

    public info(...args: unknown[]): void {
        void this.log(this.backend.info, args);
    }

    public warn(...args: unknown[]): void {
        void this.log(this.backend.warn, args);
    }

    public error(...args: unknown[]): void {
        void this.log(this.backend.error, args);
    }

    private async log(
        backendLogger: BackendLogger,
        args: unknown[],
    ): Promise<void> {
        const formattedMessage = this.format(args);

        if (!import.meta.env.DEV) {
            await backendLogger(formattedMessage);
            return;
        }

        const location = await this.captureLocation();

        await backendLogger(
            `[FRONTEND_LOC:${location.file}:${location.line}] ${formattedMessage}`,
        );
    }

    private format(args: unknown[]): string {
        return args
            .map(arg => {
                if (typeof arg === "object" && arg !== null) {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch {
                        return "[Unserializable Object]";
                    }
                }

                return String(arg);
            })
            .join(" ");
    }

    private async captureLocation(): Promise<{
        file: string;
        line: string | number;
    }> {
        try {
            // Freeze the stack before any async work.
            const stackTraceError = new Error();

            const stackframes =
                await StackTrace.fromError(stackTraceError);

            // Stack layout:
            // 0 -> captureLocation()
            // 1 -> log()
            // 2 -> logger.info()/warn()/...
            // 3 -> actual application caller
            const caller =
                stackframes[3] ??
                stackframes[2] ??
                stackframes[1] ??
                stackframes[0];

            let file = caller?.fileName ?? "unknown";

            file = file
                .replace(/^https?:\/\/[^/]+\//, "")
                .replace(/\?.*$/, "");

            return {
                file,
                line: caller?.lineNumber ?? "?",
            };
        } catch {
            return {
                file: "unknown",
                line: "?",
            };
        }
    }
}

export const logger = new Logger();
