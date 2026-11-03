import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({
  path: process.env.DOTENV_CONFIG_PATH || ".env",
});

const boolFromEnv = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  });

const envSchema = z.object({
  SEMFAZ_CND_URL: z
    .string()
    .default(
      "https://fazenda.aracaju.se.gov.br/#/publica/contribuinte/certidoes/certidao-negativa",
    ),

  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default("gemini-3.5-flash-lite"),
  /** Preferir modelo com áudio (ex.: gemini-2.5-flash). Vazio = GEMINI_MODEL / fallback. */
  GEMINI_AUDIO_MODEL: z.string().optional().default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),

  PLAYWRIGHT_HEADLESS: boolFromEnv,
  PLAYWRIGHT_SLOW_MO_MS: z.coerce.number().int().nonnegative().default(50),
  PLAYWRIGHT_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),

  /** audio = desafio de fones (padrão); tiles = grade de imagens */
  RECAPTCHA_MODE: z.enum(["audio", "tiles"]).default("audio"),
  RECAPTCHA_MAX_ROUNDS: z.coerce.number().int().positive().default(6),
  RECAPTCHA_UPSCALE: z.coerce.number().min(1).max(4).default(2),

  DOWNLOAD_DIR: z.string().default("downloads"),
  TZ: z.string().default("America/Sao_Paulo"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppEnv = z.infer<typeof envSchema> & {
  playwrightHeadless: boolean;
};

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuracao invalida: ${details}`);
  }

  const data = parsed.data;
  cached = {
    ...data,
    playwrightHeadless: data.PLAYWRIGHT_HEADLESS ?? false,
  };
  return cached;
}

export function requireGeminiKey(env: AppEnv = getEnv()): string {
  const key = env.GEMINI_API_KEY.trim();
  if (!key) {
    throw new Error("Defina GEMINI_API_KEY no .env (Google AI Studio).");
  }
  return key;
}

export function resetEnvCache(): void {
  cached = null;
}
