import type { Frame, Page } from "playwright";
import { logger } from "../logger/index.js";
import { cndSelectors, recaptchaChallengeSelectors } from "./selectors.js";

export const ANCHOR_ALREADY_SOLVED = "ANCHOR_ALREADY_SOLVED";

export async function findBframe(page: Page): Promise<Frame | null> {
  for (const frame of page.frames()) {
    if (frame.url().includes("recaptcha/api2/bframe")) return frame;
  }
  const loc = page.locator(cndSelectors.recaptchaBframe).first();
  if ((await loc.count()) === 0) return null;
  const handle = await loc.elementHandle();
  return handle ? await handle.contentFrame() : null;
}

export async function findAnchorFrame(page: Page): Promise<Frame | null> {
  for (const frame of page.frames()) {
    if (frame.url().includes("recaptcha/api2/anchor")) return frame;
  }
  const loc = page.locator(cndSelectors.recaptchaAnchorIframe).first();
  if ((await loc.count()) === 0) return null;
  const handle = await loc.elementHandle();
  return handle ? await handle.contentFrame() : null;
}

export async function isAnchorSolved(page: Page): Promise<boolean> {
  const frame = await findAnchorFrame(page);
  if (!frame) return false;
  const checked = frame.locator(
    ".recaptcha-checkbox[aria-checked='true'], .recaptcha-checkbox-checked",
  );
  return (await checked.count()) > 0;
}

export async function clickAnchorCheckbox(page: Page): Promise<void> {
  const frame = await findAnchorFrame(page);
  if (!frame) throw new Error("Iframe do reCAPTCHA (anchor) não encontrado.");
  const box = frame.locator("#recaptcha-anchor, .recaptcha-checkbox-border").first();
  await box.click({ timeout: 15_000 });
  logger.info("Checkbox reCAPTCHA clicado");
}

export async function waitForBframeChallenge(page: Page, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAnchorSolved(page)) {
      throw new Error(ANCHOR_ALREADY_SOLVED);
    }
    const frame = await findBframe(page);
    if (frame) {
      const image = frame.locator(recaptchaChallengeSelectors.root);
      const audio = frame.locator(recaptchaChallengeSelectors.audioRoot);
      const imageVisible = (await image.count()) > 0 && (await image.isVisible().catch(() => false));
      const audioVisible = (await audio.count()) > 0 && (await audio.isVisible().catch(() => false));
      if (imageVisible || audioVisible) return frame;
    }
    await page.waitForTimeout(300);
  }
  throw new Error("Timeout aguardando desafio do reCAPTCHA.");
}
