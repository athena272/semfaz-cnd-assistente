import type { Page } from "playwright";
import { logger } from "../logger/index.js";
import { formatDocumento, onlyDigits, type TipoDocumento } from "./document.js";
import { cndSelectors } from "./selectors.js";

export async function openCndPage(page: Page, url: string): Promise<void> {
  logger.info("Abrindo página de CND", { url });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(cndSelectors.documento, { state: "visible" });
  await page.waitForSelector(cndSelectors.cardHeader, { state: "visible" });
  // Angular hash-route: dá um fôlego para o formControl ligar no input
  await page.waitForTimeout(500);
}

/**
 * Preenche o input Angular disparando input/change/blur no protótipo nativo.
 * `locator.fill()` sozinho costuma não atualizar FormControl neste portal.
 */
async function setAngularInputValue(page: Page, selector: string, value: string): Promise<void> {
  const input = page.locator(selector);
  await input.waitFor({ state: "visible" });
  await input.scrollIntoViewIfNeeded();
  await input.click({ force: true });

  const ok = await input.evaluate((el, nextValue) => {
    const inputEl = el as HTMLInputElement;
    inputEl.focus();

    const proto = window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    descriptor?.set?.call(inputEl, nextValue);

    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    inputEl.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    return inputEl.value;
  }, value);

  if (!ok || onlyDigits(ok).length === 0) {
    // Fallback: digita caractere a caractere (máscaras Angular às vezes preferem isso)
    await input.fill("");
    await input.pressSequentially(value, { delay: 40 });
    await input.evaluate((el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      (el as HTMLInputElement).blur();
    });
  }
}

export async function fillCndForm(
  page: Page,
  options: { tipo: TipoDocumento; documento: string },
): Promise<void> {
  const formatted = formatDocumento(options.tipo, options.documento);
  const radio = options.tipo === "PF" ? cndSelectors.radioCpf : cndSelectors.radioCnpj;

  logger.info("Preenchendo formulário", {
    tipo: options.tipo,
    documentoMasked: formatted.replace(/\d(?=\d{2})/g, "*"),
  });

  const radioLoc = page.locator(radio);
  await radioLoc.scrollIntoViewIfNeeded();
  await radioLoc.check({ force: true });
  await page.waitForTimeout(200);

  await setAngularInputValue(page, cndSelectors.documento, formatted);
  await page.waitForTimeout(400);

  const current = await page.locator(cndSelectors.documento).inputValue();
  const digits = onlyDigits(current);
  const expected = onlyDigits(formatted);
  if (digits !== expected) {
    throw new Error(
      `Campo Documento não ficou preenchido (valor="${current}", esperado dígitos ${expected}).`,
    );
  }

  logger.info("Documento preenchido no DOM", {
    length: digits.length,
    hasMask: /[.\-/]/.test(current),
  });
}

export async function clickEmitir(page: Page): Promise<void> {
  const btn = page.locator(cndSelectors.emitir).first();
  await btn.waitFor({ state: "visible" });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const disabled = await btn.isDisabled().catch(() => true);
    if (!disabled) break;
    await page.waitForTimeout(250);
  }

  if (await btn.isDisabled()) {
    throw new Error("Botão Emitir continua desabilitado (documento/captcha inválidos?).");
  }

  logger.info("Clicando em Emitir");
  await btn.click();
}
