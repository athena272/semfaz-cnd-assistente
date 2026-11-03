export type TipoDocumento = "PF" | "PJ";

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Formata CPF/CNPJ como o portal costuma exibir. */
export function formatDocumento(tipo: TipoDocumento, raw: string): string {
  const digits = onlyDigits(raw);
  if (tipo === "PF") {
    if (digits.length !== 11) {
      throw new Error(`CPF deve ter 11 dígitos (recebido ${digits.length}).`);
    }
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length !== 14) {
    throw new Error(`CNPJ deve ter 14 dígitos (recebido ${digits.length}).`);
  }
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
