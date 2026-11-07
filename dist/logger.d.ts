/** Structured fields attached to a log record. */
export type LogFields = Readonly<Record<string, unknown>>;
/** Minimal logger contract. The library never configures logging globally. */
export interface Logger {
    info(message: string, fields?: LogFields): void;
    warn(message: string, fields?: LogFields): void;
}
/** Logger that discards every record; the default everywhere. */
export declare const silentLogger: Logger;
