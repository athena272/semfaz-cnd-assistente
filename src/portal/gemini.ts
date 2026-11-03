import sharp from "sharp";
import { getEnv, requireGeminiKey } from "../config/env.js";
import { logger } from "../logger/index.js";

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string; code?: number };
}

export type GeminiGenerationConfig = {
  temperature: number;
  maxOutputTokens: number;
  thinkingConfig?: {
    thinkingLevel?: string;
    thinkingBudget?: number;
    includeThoughts?: boolean;
  };
};

const IMAGE_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
];

/** Modelos com suporte mais confiável a áudio inline. */
const AUDIO_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash-lite",
];

export function buildGenerationConfig(model: string): GeminiGenerationConfig {
  const base: GeminiGenerationConfig = {
    temperature: 0,
    maxOutputTokens: 256,
  };
  const name = model.toLowerCase();
  if (name.includes("gemini-3") || /(^|[/-])3\.\d/.test(name)) {
    return {
      ...base,
      thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false },
    };
  }
  if (name.includes("2.5")) {
    return {
      ...base,
      thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
    };
  }
  return base;
}

export function modelsToTry(primary: string, fallbacks: string[]): string[] {
  const out: string[] = [];
  for (const m of [primary, ...fallbacks]) {
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

export async function upscalePng(image: Buffer, factor: number): Promise<Buffer> {
  if (factor <= 1) return image;
  const meta = await sharp(image).metadata();
  const width = Math.round((meta.width ?? 400) * factor);
  return sharp(image).resize({ width }).png().toBuffer();
}

async function callGemini(options: {
  apiKey: string;
  model: string;
  prompt: string;
  mimeType: string;
  data: Buffer;
  timeoutMs: number;
}): Promise<{ ok: boolean; status: number; text: string; raw: GeminiResponse; reason?: string }> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent` +
    `?key=${encodeURIComponent(options.apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: options.prompt },
              {
                inline_data: {
                  mime_type: options.mimeType,
                  data: options.data.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: buildGenerationConfig(options.model),
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, text: "", raw: {}, reason };
  }

  let raw: GeminiResponse;
  try {
    raw = (await response.json()) as GeminiResponse;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "JSON inválido na resposta Gemini";
    return { ok: false, status: response.status, text: "", raw: {}, reason };
  }

  const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return {
    ok: response.ok && !raw.error,
    status: response.status,
    text,
    raw,
    reason: raw.error?.message,
  };
}

/**
 * Itera modelos/tentativas; `parse` retorna null para “inválido, tente de novo”.
 */
export async function withModelFallback<T>(options: {
  primary: string;
  fallbacks: string[];
  label: string;
  attemptsPerModel?: number;
  run: (
    model: string,
    attempt: number,
  ) => Promise<{ value: T | null; ok: boolean; status: number; reason?: string; preview?: string }>;
}): Promise<T> {
  const attempts = options.attemptsPerModel ?? 2;
  let lastError = `Gemini sem resposta (${options.label})`;

  for (const model of modelsToTry(options.primary, options.fallbacks)) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const result = await options.run(model, attempt);
      if (!result.ok) {
        lastError = result.reason || `Gemini HTTP ${result.status}`;
        logger.warn(`${options.label} falhou; tentando outro modelo/tentativa`, {
          model,
          status: result.status,
          reason: lastError,
        });
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (result.value === null) {
        lastError = result.reason || `Resposta inválida: ${result.preview || ""}`;
        logger.warn(`${options.label} retornou valor inválido`, {
          model,
          preview: result.preview?.slice(0, 160),
        });
        continue;
      }
      return result.value;
    }
  }

  throw new Error(`Falha Gemini (${options.label}): ${lastError}`);
}

/**
 * Transcreve o MP3 do desafio de áudio do reCAPTCHA.
 */
export async function askGeminiAudioTranscript(audioMp3: Buffer): Promise<string> {
  const env = getEnv();
  const apiKey = requireGeminiKey(env);
  const primary = env.GEMINI_AUDIO_MODEL.trim() || env.GEMINI_MODEL.trim() || "gemini-2.5-flash";
  const timeoutMs = env.GEMINI_TIMEOUT_MS;

  const prompt =
    `This is a Google reCAPTCHA audio challenge (Portuguese or English digits/words).\n` +
    `Transcribe exactly what a human should type in the answer box.\n` +
    `Usually it is a sequence of digits and/or short words.\n` +
    `Reply with ONLY the answer text — no quotes, no markdown, no explanation.`;

  const answer = await withModelFallback({
    primary,
    fallbacks: AUDIO_FALLBACK_MODELS,
    label: "Gemini áudio",
    run: async (model) => {
      const { ok, status, text, reason } = await callGemini({
        apiKey,
        model,
        prompt,
        mimeType: "audio/mp3",
        data: audioMp3,
        timeoutMs,
      });
      if (!ok) return { value: null, ok: false, status, reason };
      const normalized = normalizeAudioAnswer(text);
      if (!normalized) {
        return {
          value: null,
          ok: true,
          status,
          reason: `Resposta vazia: ${text.slice(0, 80)}`,
          preview: text,
        };
      }
      logger.info("Gemini transcreveu áudio", { model, answerLength: normalized.length });
      return { value: normalized, ok: true, status };
    },
  });

  return answer;
}

export function normalizeAudioAnswer(text: string): string {
  const withoutFences = text.replace(/```(?:[\w+-]*)?\n?/g, "").replace(/```/g, "");
  return withoutFences
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

/**
 * Pede ao Gemini os índices (0-based) das tiles que batem com a instrução.
 */
export async function askGeminiTileIndices(options: {
  screenshotPng: Buffer;
  instruction: string;
  tileCount: number;
}): Promise<number[]> {
  const env = getEnv();
  const apiKey = requireGeminiKey(env);
  const image = await upscalePng(options.screenshotPng, env.RECAPTCHA_UPSCALE);
  const timeoutMs = env.GEMINI_TIMEOUT_MS;

  const prompt =
    `You are solving a Google reCAPTCHA image challenge.\n` +
    `Instruction (Portuguese): "${options.instruction}"\n` +
    `There are exactly ${options.tileCount} tiles, indexed 0 to ${options.tileCount - 1}, ` +
    `row-major left-to-right, top-to-bottom.\n` +
    `Select EVERY tile that matches the instruction. If a target object spans multiple tiles, include all of them.\n` +
    `If none match, return an empty list.\n` +
    `Reply with ONLY compact JSON: {"indices":[...]} — no markdown.`;

  return withModelFallback({
    primary: env.GEMINI_MODEL.trim() || "gemini-3.5-flash-lite",
    fallbacks: IMAGE_FALLBACK_MODELS,
    label: "Gemini tiles",
    run: async (model) => {
      const { ok, status, text, reason } = await callGemini({
        apiKey,
        model,
        prompt,
        mimeType: "image/png",
        data: image,
        timeoutMs,
      });
      if (!ok) return { value: null, ok: false, status, reason };
      const indices = parseIndicesJson(text, options.tileCount);
      if (!indices) {
        return {
          value: null,
          ok: true,
          status,
          reason: `Resposta inválida: ${text.slice(0, 120)}`,
          preview: text,
        };
      }
      logger.info("Gemini escolheu tiles", {
        model,
        indices,
        instruction: options.instruction,
      });
      return { value: indices, ok: true, status };
    },
  });
}

export function parseIndicesJson(text: string, tileCount: number): number[] | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { indices?: unknown };
    if (!Array.isArray(parsed.indices)) return null;
    const out: number[] = [];
    for (const item of parsed.indices) {
      const n = typeof item === "number" ? item : Number(item);
      if (!Number.isInteger(n) || n < 0 || n >= tileCount) continue;
      if (!out.includes(n)) out.push(n);
    }
    return out;
  } catch {
    return null;
  }
}
