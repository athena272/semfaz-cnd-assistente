import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Frame, Page } from "playwright";
import { getEnv } from "../config/env.js";
import { logger } from "../logger/index.js";
import { askGeminiAudioTranscript, askGeminiTileIndices } from "./gemini.js";
import {
  ANCHOR_ALREADY_SOLVED,
  clickAnchorCheckbox,
  findBframe,
  isAnchorSolved,
  waitForBframeChallenge,
} from "./recaptcha-frames.js";
import { recaptchaChallengeSelectors } from "./selectors.js";

async function switchToAudioChallenge(frame: Frame): Promise<void> {
  const audioRoot = frame.locator(recaptchaChallengeSelectors.audioRoot);
  if ((await audioRoot.count()) > 0 && (await audioRoot.isVisible().catch(() => false))) {
    return;
  }

  const audioBtn = frame.locator(recaptchaChallengeSelectors.audioButton);
  await audioBtn.waitFor({ state: "visible", timeout: 10_000 });
  await audioBtn.click();
  await audioRoot.waitFor({ state: "visible", timeout: 15_000 });
  logger.info("Trocou para desafio de áudio");
}

async function resolveAudioUrl(frame: Frame): Promise<string> {
  const fromAudio = await frame.locator(recaptchaChallengeSelectors.audioSource).getAttribute("src");
  if (fromAudio) return fromAudio;

  const fromDownload = await frame
    .locator(recaptchaChallengeSelectors.audioDownload)
    .getAttribute("href");
  if (fromDownload) return fromDownload;

  throw new Error("URL do áudio do reCAPTCHA não encontrada.");
}

async function downloadAudio(page: Page, audioUrl: string): Promise<Buffer> {
  const absolute = audioUrl.startsWith("http")
    ? audioUrl
    : new URL(audioUrl, "https://www.google.com").toString();

  const response = await page.request.get(absolute);
  if (!response.ok()) {
    throw new Error(`Download do áudio falhou: HTTP ${response.status()}`);
  }
  return Buffer.from(await response.body());
}

async function saveEvidenceFile(data: Buffer, label: string, ext: string): Promise<string> {
  const dir = path.resolve("evidence");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${label}.${ext}`);
  await writeFile(file, data);
  return file;
}

async function solveAudioRounds(page: Page, frame: Frame): Promise<void> {
  const env = getEnv();
  await switchToAudioChallenge(frame);

  for (let round = 1; round <= env.RECAPTCHA_MAX_ROUNDS; round++) {
    if (await isAnchorSolved(page)) {
      logger.info("reCAPTCHA resolvido (áudio)", { round });
      return;
    }

    frame = (await findBframe(page)) ?? frame;
    await switchToAudioChallenge(frame);

    const audioUrl = await resolveAudioUrl(frame);
    const mp3 = await downloadAudio(page, audioUrl);
    const evidencePath = await saveEvidenceFile(mp3, `audio-round-${round}`, "mp3");
    logger.info("Áudio baixado", { round, bytes: mp3.length, evidencePath });

    const answer = await askGeminiAudioTranscript(mp3);
    logger.info("Resposta do áudio", {
      round,
      length: answer.length,
    });

    const input = frame.locator(recaptchaChallengeSelectors.audioResponse);
    await input.click({ force: true });
    await input.fill("");
    await input.fill(answer);

    await frame.locator(recaptchaChallengeSelectors.verify).click();
    await page.waitForTimeout(1800);

    if (await isAnchorSolved(page)) {
      logger.info("reCAPTCHA resolvido após áudio", { round });
      return;
    }

    const err = frame.locator(recaptchaChallengeSelectors.audioError);
    if (await err.isVisible().catch(() => false)) {
      const msg = ((await err.innerText().catch(() => "")) || "").trim();
      logger.warn("Áudio rejeitado", { round, msg });
    }

    const reload = frame.locator(recaptchaChallengeSelectors.reload);
    if ((await reload.count()) > 0) {
      await reload.click().catch(() => undefined);
      await page.waitForTimeout(1000);
    }
  }

  throw new Error(
    `reCAPTCHA áudio não resolvido após ${env.RECAPTCHA_MAX_ROUNDS} rodadas (experimento Gemini).`,
  );
}

async function solveTileRounds(page: Page, frame: Frame): Promise<void> {
  const env = getEnv();

  for (let round = 1; round <= env.RECAPTCHA_MAX_ROUNDS; round++) {
    if (await isAnchorSolved(page)) {
      logger.info("reCAPTCHA resolvido (tiles)", { round });
      return;
    }

    frame = (await findBframe(page)) ?? frame;
    const tiles = frame.locator(recaptchaChallengeSelectors.tiles);
    const tileCount = await tiles.count();
    if (tileCount === 0) {
      await page.waitForTimeout(500);
      continue;
    }

    const instructionLoc = frame.locator(recaptchaChallengeSelectors.instruction).first();
    const instruction =
      ((await instructionLoc.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim() ||
      "(instrução não lida)";

    const challenge = frame.locator(recaptchaChallengeSelectors.root);
    const png = await challenge.screenshot({ type: "png" });
    const evidencePath = await saveEvidenceFile(png, `tiles-round-${round}`, "png");
    logger.info("Rodada tiles", { round, tileCount, instruction, evidencePath });

    const indices = await askGeminiTileIndices({
      screenshotPng: png,
      instruction,
      tileCount,
    });

    for (const idx of indices) {
      await tiles.nth(idx).click({ delay: 40 });
      await page.waitForTimeout(120);
    }

    await frame.locator(recaptchaChallengeSelectors.verify).click();
    await page.waitForTimeout(1500);

    if (await isAnchorSolved(page)) {
      logger.info("reCAPTCHA resolvido após tiles", { round });
      return;
    }
  }

  throw new Error(
    `reCAPTCHA tiles não resolvido após ${env.RECAPTCHA_MAX_ROUNDS} rodadas (experimento Gemini).`,
  );
}

/**
 * Experimento: resolve reCAPTCHA v2 via Gemini.
 * Padrão: desafio de áudio (MP3 → transcrição). Alternativa: tiles.
 */
export async function solveRecaptchaWithGemini(page: Page): Promise<void> {
  const env = getEnv();

  if (await isAnchorSolved(page)) {
    logger.info("reCAPTCHA já estava resolvido");
    return;
  }

  await clickAnchorCheckbox(page);
  await page.waitForTimeout(800);

  if (await isAnchorSolved(page)) {
    logger.info("reCAPTCHA aceitou só o checkbox (sem desafio)");
    return;
  }

  let frame: Frame;
  try {
    frame = await waitForBframeChallenge(page, 20_000);
  } catch (err) {
    if (err instanceof Error && err.message === ANCHOR_ALREADY_SOLVED) {
      logger.info("reCAPTCHA resolvido após checkbox");
      return;
    }
    throw err;
  }

  logger.info("Modo reCAPTCHA", { mode: env.RECAPTCHA_MODE });

  if (env.RECAPTCHA_MODE === "audio") {
    await solveAudioRounds(page, frame);
    return;
  }

  await solveTileRounds(page, frame);
}
