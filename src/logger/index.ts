import { getEnv } from "../config/env.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "senha",
  "token",
  "apiKey",
  "GEMINI_API_KEY",
  "authorization",
]);

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/key[=:]\s*\S+/gi, "key=[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(k) || /password|senha|token|secret|apikey/i.test(k)) {
        next[k] = "[REDACTED]";
      } else {
        next[k] = redactValue(v);
      }
    }
    return next;
  }
  return value;
}

function shouldLog(level: Level): boolean {
  try {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[getEnv().LOG_LEVEL];
  } catch {
    return true;
  }
}

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta: redactValue(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
