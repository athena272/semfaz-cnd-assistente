import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "../src/config/env.js";

afterEach(() => {
  resetEnvCache();
});

describe("getEnv", () => {
  it("aplica default de RECAPTCHA_MODE e GEMINI_TIMEOUT_MS quando ausentes", () => {
    const prevMode = process.env.RECAPTCHA_MODE;
    const prevTimeout = process.env.GEMINI_TIMEOUT_MS;
    delete process.env.RECAPTCHA_MODE;
    delete process.env.GEMINI_TIMEOUT_MS;
    resetEnvCache();

    try {
      const env = getEnv();
      expect(env.RECAPTCHA_MODE).toBe("audio");
      expect(env.GEMINI_TIMEOUT_MS).toBe(45_000);
    } finally {
      if (prevMode === undefined) delete process.env.RECAPTCHA_MODE;
      else process.env.RECAPTCHA_MODE = prevMode;
      if (prevTimeout === undefined) delete process.env.GEMINI_TIMEOUT_MS;
      else process.env.GEMINI_TIMEOUT_MS = prevTimeout;
    }
  });

  it("lê RECAPTCHA_MODE=tiles", () => {
    const prev = process.env.RECAPTCHA_MODE;
    process.env.RECAPTCHA_MODE = "tiles";
    resetEnvCache();
    try {
      expect(getEnv().RECAPTCHA_MODE).toBe("tiles");
    } finally {
      if (prev === undefined) delete process.env.RECAPTCHA_MODE;
      else process.env.RECAPTCHA_MODE = prev;
    }
  });

  it("interpreta PLAYWRIGHT_HEADLESS=true", () => {
    const prev = process.env.PLAYWRIGHT_HEADLESS;
    process.env.PLAYWRIGHT_HEADLESS = "true";
    resetEnvCache();
    try {
      expect(getEnv().playwrightHeadless).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_HEADLESS;
      else process.env.PLAYWRIGHT_HEADLESS = prev;
    }
  });
});
