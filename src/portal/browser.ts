import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { getEnv } from "../config/env.js";
import { logger } from "../logger/index.js";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function openBrowserSession(options?: {
  headless?: boolean;
}): Promise<BrowserSession> {
  const env = getEnv();
  const headless = options?.headless ?? env.playwrightHeadless;

  logger.info("Abrindo Chromium", { headless, timeoutMs: env.PLAYWRIGHT_TIMEOUT_MS });

  const browser = await chromium.launch({
    headless,
    slowMo: env.PLAYWRIGHT_SLOW_MO_MS,
  });

  const context = await browser.newContext({
    locale: "pt-BR",
    timezoneId: env.TZ,
    acceptDownloads: true,
  });
  context.setDefaultTimeout(env.PLAYWRIGHT_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(env.PLAYWRIGHT_TIMEOUT_MS);

  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      logger.info("Browser encerrado");
    },
  };
}
