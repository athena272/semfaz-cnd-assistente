/**
 * Seletores da tela pública de CND (Angular SEMFAZ).
 * Baseados no HTML fornecido pelo usuário.
 */
export const cndSelectors = {
  radioCpf: 'input[type="radio"][value="PF"]',
  radioCnpj: 'input[type="radio"][value="PJ"]',
  documento: "#idInput1numeroDocumento",
  emitir: 'semfaz-botao-bloquear-liberar button, button:has-text("Emitir")',
  cardHeader: ".card-header",
  recaptchaAnchorIframe: 'iframe[src*="recaptcha/api2/anchor"]',
  recaptchaBframe: 'iframe[src*="recaptcha/api2/bframe"]',
} as const;

export const recaptchaChallengeSelectors = {
  root: "#rc-imageselect",
  audioRoot: "#rc-audio",
  instruction: ".rc-imageselect-desc-wrapper, .rc-imageselect-desc-no-canonical, .rc-imageselect-desc",
  tiles: "td.rc-imageselect-tile",
  verify: "#recaptcha-verify-button",
  reload: "#recaptcha-reload-button",
  audioButton: "#recaptcha-audio-button",
  imageButton: "#recaptcha-image-button",
  audioSource: "#audio-source",
  audioDownload: "a.rc-audiochallenge-tdownload-link",
  audioResponse: "#audio-response",
  audioError: ".rc-audiochallenge-error-message",
  errorIncorrect: ".rc-imageselect-incorrect-response",
  errorSelectMore: ".rc-imageselect-error-select-more",
  errorDynamicMore: ".rc-imageselect-error-dynamic-more",
} as const;
