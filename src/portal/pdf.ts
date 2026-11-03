/** Verifica assinatura mágica de PDF (%PDF). */
export function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  return buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

export function sanitizeUrlForLog(url: string, max = 200): string {
  try {
    const parsed = new URL(url);
    if (parsed.search) parsed.search = "?[redacted]";
    return parsed.toString().slice(0, max);
  } catch {
    return url.slice(0, max);
  }
}

/** Tenta decodificar string base64 (ou data-URL) em PDF. */
export function tryDecodePdfBase64(value: string): Buffer | null {
  let raw = value.trim();
  const dataUrl = raw.match(/^data:application\/pdf;base64,(.+)$/i);
  if (dataUrl) raw = dataUrl[1] ?? raw;
  raw = raw.replace(/\s/g, "");
  if (raw.length < 16) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    return isPdfBuffer(buf) ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Percorre JSON (ex.: resposta emitir-certidao-negativa) em busca de PDF em base64.
 */
export function extractPdfFromUnknownJson(data: unknown): Buffer | null {
  const candidates: string[] = [];

  const walk = (value: unknown, depth: number): void => {
    if (depth > 8 || value == null) return;
    if (typeof value === "string") {
      if (value.length >= 64) candidates.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        walk(nested, depth + 1);
      }
    }
  };

  walk(data, 0);

  // Preferir strings que já parecem PDF em base64 (JVBERi0 = %PDF)
  candidates.sort((a, b) => {
    const score = (s: string) => (s.replace(/\s/g, "").startsWith("JVBERi0") ? 0 : 1);
    return score(a) - score(b) || b.length - a.length;
  });

  for (const candidate of candidates) {
    const pdf = tryDecodePdfBase64(candidate);
    if (pdf) return pdf;
  }
  return null;
}
