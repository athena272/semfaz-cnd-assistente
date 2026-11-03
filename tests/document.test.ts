import { describe, expect, it } from "vitest";
import { formatDocumento, onlyDigits } from "../src/portal/document.js";

describe("onlyDigits", () => {
  it("remove máscara", () => {
    expect(onlyDigits("073.806.135-29")).toBe("07380613529");
  });
});

describe("formatDocumento", () => {
  it("formata CPF", () => {
    expect(formatDocumento("PF", "07380613529")).toBe("073.806.135-29");
  });

  it("formata CNPJ", () => {
    expect(formatDocumento("PJ", "11222333000181")).toBe("11.222.333/0001-81");
  });

  it("rejeita CPF com tamanho errado", () => {
    expect(() => formatDocumento("PF", "123")).toThrow(/11 dígitos/);
  });

  it("rejeita CNPJ com tamanho errado", () => {
    expect(() => formatDocumento("PJ", "123")).toThrow(/14 dígitos/);
  });
});
