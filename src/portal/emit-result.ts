import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page, Response } from "playwright";
import { logger } from "../logger/index.js";
import {
  extractPdfFromUnknownJson,
  isPdfBuffer,
  sanitizeUrlForLog,
} from "./pdf.js";

export type EmitResult =
  | { kind: "download"; path: string }
  | { kind: "pdf-response"; path: string; url: string }
  | { kind: "popup-pdf"; path: string; url: string }
  | { kind: "unknown"; shot: string; hints: string[] };

export function looksLikePdfResponse(meta: {
  url: string;
  contentType: string;
  ok: boolean;
}): boolean {
  const url = meta.url.toLowerCase();
  const type = meta.contentType.toLowerCase();
  if (type.includes("application/pdf")) return true;
  if (type.includes("application/octet-stream") && url.includes(".pdf")) return true;
  if (url.includes(".pdf") && meta.ok) return true;
  if (
    meta.ok &&
    (url.includes("certidao") || url.includes("cnd") || url.includes("negativa")) &&
    (type.includes("pdf") || type.includes("octet-stream"))
  ) {
    return true;
  }
  return false;
}

export function looksLikeCertidaoJson(meta: {
  url: string;
  contentType: string;
  ok: boolean;
}): boolean {
  if (!meta.ok) return false;
  const type = meta.contentType.toLowerCase();
  if (!type.includes("json")) return false;
  const url = meta.url.toLowerCase();
  return (
    url.includes("certidao") ||
    url.includes("cnd") ||
    url.includes("negativa") ||
    url.includes("emitir")
  );
}

async function savePdfBuffer(dir: string, buffer: Buffer, hint: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, `cnd-${hint}-${Date.now()}.pdf`);
  await writeFile(dest, buffer);
  return dest;
}

/** Lê PDF de blob:/http(s): no contexto da página (blob: não funciona via request.get). */
export async function readPdfBytesFromPage(page: Page): Promise<Buffer | null> {
  const url = page.url();

  if (url.startsWith("blob:") || url.startsWith("http")) {
    try {
      const base64 = await page.evaluate(async () => {
        const res = await fetch(location.href);
        const ab = await res.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const chunk = 0x8000;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
      });
      const buf = Buffer.from(base64, "base64");
      return isPdfBuffer(buf) ? buf : null;
    } catch {
      // fallback http abaixo
    }
  }

  if (url.startsWith("http")) {
    try {
      const res = await page.request.get(url);
      const body = Buffer.from(await res.body());
      return isPdfBuffer(body) ? body : null;
    } catch {
      return null;
    }
  }

  return null;
}

export interface ArmedEmitCapture {
  wait: () => Promise<EmitResult>;
}

/**
 * Arma listeners de download/rede/popup ANTES do clique em Emitir.
 * Cleanup explícito no primeiro resultado ou timeout.
 */
export function armEmitCapture(
  page: Page,
  options: { downloadDir: string; timeoutMs?: number },
): ArmedEmitCapture {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const hints: string[] = [];
  let settled: EmitResult | null = null;
  let cleaned = false;
  const abort = new AbortController();

  let resolveDone!: (result: EmitResult) => void;
  const done = new Promise<EmitResult>((resolve) => {
    resolveDone = resolve;
  });

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    abort.abort();
    page.off("response", onResponse);
  };

  const finish = (result: EmitResult) => {
    if (settled) return;
    settled = result;
    cleanup();
    resolveDone(result);
  };

  const onResponse = (response: Response) => {
    if (settled || abort.signal.aborted) return;
    void (async () => {
      try {
        const url = response.url();
        if (!response.ok()) return;

        const type = (response.headers()["content-type"] || "").toLowerCase();
        const meta = { url, contentType: type, ok: response.ok() };

        if (
          url.includes("certidao") ||
          url.includes("cnd") ||
          url.includes("negativa") ||
          type.includes("pdf") ||
          type.includes("json")
        ) {
          hints.push(`${response.status()} ${type || "?"} ${sanitizeUrlForLog(url, 120)}`);
          logger.info("Resposta após Emitir", {
            status: response.status(),
            contentType: type,
            url: sanitizeUrlForLog(url),
          });
        }

        // JSON da API (emitir-certidao-negativa) com PDF em base64
        if (looksLikeCertidaoJson(meta)) {
          const json = (await response.json()) as unknown;
          const pdf = extractPdfFromUnknownJson(json);
          if (pdf && !settled) {
            const dest = await savePdfBuffer(options.downloadDir, pdf, "json");
            logger.info("PDF capturado via JSON da API", {
              dest,
              url: sanitizeUrlForLog(url),
            });
            finish({ kind: "pdf-response", path: dest, url });
          } else {
            logger.warn("JSON da certidão sem PDF em base64 reconhecível", {
              url: sanitizeUrlForLog(url),
            });
          }
          // Body já consumido por response.json()
          return;
        }

        if (!looksLikePdfResponse(meta)) return;
        const buffer = Buffer.from(await response.body());
        if (buffer.length < 100) return;
        if (!isPdfBuffer(buffer) && !type.includes("pdf")) return;
        if (settled) return;

        const dest = await savePdfBuffer(options.downloadDir, buffer, "net");
        logger.info("PDF capturado via rede", { dest, url: sanitizeUrlForLog(url) });
        finish({ kind: "pdf-response", path: dest, url });
      } catch (err) {
        logger.warn("Falha ao inspecionar resposta após Emitir", {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  };

  page.on("response", onResponse);

  page
    .waitForEvent("download", { timeout: timeoutMs })
    .then(async (download) => {
      if (settled || abort.signal.aborted) return;
      try {
        const dest = path.join(
          options.downloadDir,
          download.suggestedFilename() || `cnd-download-${Date.now()}.pdf`,
        );
        await download.saveAs(dest);
        logger.info("PDF capturado via download", { dest });
        finish({ kind: "download", path: dest });
      } catch (err) {
        logger.warn("Falha ao salvar download", {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })
    .catch((err) => {
      if (settled || abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      if (!/Timeout/i.test(message)) {
        logger.warn("Listener de download encerrou", { reason: message });
      }
    });

  page
    .context()
    .waitForEvent("page", { timeout: timeoutMs })
    .then(async (popup) => {
      if (settled || abort.signal.aborted) return;
      try {
        await popup.waitForLoadState("domcontentloaded").catch((err) => {
          logger.warn("Popup sem load completo", {
            reason: err instanceof Error ? err.message : String(err),
          });
        });
        // Viewer de PDF do Chromium pode demorar um pouco a montar o blob
        await popup.waitForTimeout(500);

        const url = popup.url();
        hints.push(`popup:${sanitizeUrlForLog(url, 120)}`);
        logger.info("Nova aba após Emitir", { url: sanitizeUrlForLog(url) });

        const body = await readPdfBytesFromPage(popup);
        if (body && !settled) {
          const dest = await savePdfBuffer(options.downloadDir, body, "popup");
          logger.info("PDF capturado via popup/blob", {
            dest,
            url: sanitizeUrlForLog(url),
          });
          finish({ kind: "popup-pdf", path: dest, url });
          return;
        }

        logger.warn("Popup aberto, mas PDF não lido do blob/http", {
          url: sanitizeUrlForLog(url),
        });

        await mkdir("evidence", { recursive: true });
        const shot = path.join("evidence", `popup-${Date.now()}.png`);
        await popup.screenshot({ path: shot, fullPage: true }).catch((err) => {
          logger.warn("Falha no screenshot do popup", {
            reason: err instanceof Error ? err.message : String(err),
          });
        });
        hints.push(`popup-shot:${shot}`);
      } catch (err) {
        logger.warn("Falha ao tratar popup", {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })
    .catch((err) => {
      if (settled || abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      if (!/Timeout/i.test(message)) {
        logger.warn("Listener de popup encerrou", { reason: message });
      }
    });

  void (async () => {
    await page.waitForTimeout(5_000);
    if (settled || abort.signal.aborted) return;
    await mkdir("evidence", { recursive: true });
    const shot = path.join("evidence", `pos-emitir-early-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch((err) => {
      logger.warn("Falha no screenshot precoce", {
        reason: err instanceof Error ? err.message : String(err),
      });
    });
    hints.push(`early-shot:${shot}`);
    logger.info("Screenshot precoce após Emitir", { shot });
  })();

  return {
    wait: async () => {
      const timeout = page.waitForTimeout(timeoutMs).then(async () => {
        if (settled) return settled;
        cleanup();
        await mkdir("evidence", { recursive: true });
        const shot = path.join("evidence", `pos-emitir-${Date.now()}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        return { kind: "unknown" as const, shot, hints: [...hints] };
      });

      return Promise.race([done, timeout]);
    },
  };
}
