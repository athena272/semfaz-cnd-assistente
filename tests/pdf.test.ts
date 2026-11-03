import { describe, expect, it } from "vitest";
import { looksLikeCertidaoJson, looksLikePdfResponse } from "../src/portal/emit-result.js";
import {
  extractPdfFromUnknownJson,
  isPdfBuffer,
  sanitizeUrlForLog,
  tryDecodePdfBase64,
} from "../src/portal/pdf.js";

describe("isPdfBuffer", () => {
  it("aceita magic %PDF", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.4\n..."))).toBe(true);
  });

  it("rejeita buffer curto ou sem magic", () => {
    expect(isPdfBuffer(Buffer.from("ABC"))).toBe(false);
    expect(isPdfBuffer(Buffer.from("not-a-pdf-file-content"))).toBe(false);
  });
});

describe("looksLikePdfResponse", () => {
  it("detecta content-type pdf", () => {
    expect(
      looksLikePdfResponse({
        url: "https://example.com/x",
        contentType: "application/pdf",
        ok: true,
      }),
    ).toBe(true);
  });

  it("detecta URL de certidão com octet-stream", () => {
    expect(
      looksLikePdfResponse({
        url: "https://fazenda.example/api/certidao/123",
        contentType: "application/octet-stream",
        ok: true,
      }),
    ).toBe(true);
  });
});

describe("looksLikeCertidaoJson", () => {
  it("aceita JSON do endpoint emitir-certidao-negativa", () => {
    expect(
      looksLikeCertidaoJson({
        url: "https://fazenda.aracaju.se.gov.br/semfaz/publica/portal-contribuinte/certidoes/emitir-certidao-negativa",
        contentType: "application/json;charset=utf-8",
        ok: true,
      }),
    ).toBe(true);
  });
});

describe("extractPdfFromUnknownJson", () => {
  it("extrai PDF embutido em base64", () => {
    const pdf = Buffer.from("%PDF-1.4\n" + "x".repeat(80));
    const b64 = pdf.toString("base64");
    const found = extractPdfFromUnknownJson({
      sucesso: true,
      arquivo: b64,
    });
    expect(found).not.toBeNull();
    expect(isPdfBuffer(found!)).toBe(true);
  });

  it("retorna null sem candidato válido", () => {
    expect(extractPdfFromUnknownJson({ msg: "ok", n: 1 })).toBeNull();
  });
});

describe("tryDecodePdfBase64", () => {
  it("aceita data-URL", () => {
    const pdf = Buffer.from("%PDF-1.4\n" + "y".repeat(80));
    const dataUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;
    const decoded = tryDecodePdfBase64(dataUrl);
    expect(decoded).not.toBeNull();
    expect(isPdfBuffer(decoded!)).toBe(true);
  });
});

describe("sanitizeUrlForLog", () => {
  it("remove query string", () => {
    const out = sanitizeUrlForLog("https://google.com/payload?p=secret&k=key");
    expect(out).toContain("?[redacted]");
    expect(out).not.toContain("secret");
  });

  it("mantém blob: truncado", () => {
    const out = sanitizeUrlForLog(
      "blob:https://fazenda.aracaju.se.gov.br/a2cd6a6b-549f-42af-a9eb-ca96671f3fc2",
    );
    expect(out.startsWith("blob:")).toBe(true);
  });
});
