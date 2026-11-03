import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../config/env.js";
import { logger } from "../logger/index.js";
import { openBrowserSession } from "../portal/browser.js";
import { armEmitCapture } from "../portal/emit-result.js";
import { clickEmitir, fillCndForm, openCndPage } from "../portal/form.js";
import { solveRecaptchaWithGemini } from "../portal/recaptcha-gemini.js";
import { parseArgs } from "./args.js";

async function main(): Promise<void> {
  const { tipo, documento, dryRun } = parseArgs(process.argv.slice(2));
  const env = getEnv();
  await mkdir(env.DOWNLOAD_DIR, { recursive: true });
  await mkdir("evidence", { recursive: true });

  const session = await openBrowserSession();
  try {
    await openCndPage(session.page, env.SEMFAZ_CND_URL);
    await fillCndForm(session.page, { tipo, documento });
    await solveRecaptchaWithGemini(session.page);

    if (dryRun) {
      logger.info("DRY-RUN: captcha aparentemente ok; não clicou em Emitir");
      await session.page.screenshot({
        path: path.join("evidence", `dry-run-${Date.now()}.png`),
        fullPage: true,
      });
      return;
    }

    const capture = armEmitCapture(session.page, {
      downloadDir: env.DOWNLOAD_DIR,
      timeoutMs: 45_000,
    });
    await clickEmitir(session.page);
    const result = await capture.wait();

    if (result.kind === "unknown") {
      logger.error("Emitir clicou, mas PDF não foi capturado", {
        shot: result.shot,
        hints: result.hints,
      });
      throw new Error(
        "PDF da CND não foi capturado após Emitir (veja evidence/ e hints no log).",
      );
    }

    logger.info("CND capturada", { kind: result.kind, path: result.path });
  } finally {
    if (!env.playwrightHeadless) {
      logger.info("Aguardando 5s antes de fechar o browser (headed)");
      await session.page.waitForTimeout(5000);
    }
    await session.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error(message, stack ? { stack } : undefined);
  process.exitCode = 1;
});
