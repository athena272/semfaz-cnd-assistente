import type { TipoDocumento } from "../portal/document.js";

export interface EmitirArgs {
  tipo: TipoDocumento;
  documento: string;
  dryRun: boolean;
}

export function printUsage(): void {
  console.log(`Uso:
  pnpm emitir -- --tipo PF|PJ --documento <cpf_ou_cnpj> [--dry-run]

Exemplos:
  pnpm emitir -- --tipo PF --documento 00000000000
  pnpm emitir -- --tipo PJ --documento 00000000000000 --dry-run

Requer GEMINI_API_KEY no .env. Experimento: o reCAPTCHA pode falhar.

Exit codes:
  0 — dry-run OK, ou PDF capturado após Emitir
  1 — falha (captcha, formulário, ou PDF não capturado)
`);
}

export function parseArgs(argv: string[]): EmitirArgs {
  const args = [...argv];
  let tipo: TipoDocumento | undefined;
  let documento = "";
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") continue;
    if (a === "--tipo" || a === "-t") {
      const v = (args[++i] || "").toUpperCase();
      if (v !== "PF" && v !== "PJ" && v !== "CPF" && v !== "CNPJ") {
        throw new Error(`--tipo inválido: ${v}`);
      }
      tipo = v === "CPF" || v === "PF" ? "PF" : "PJ";
    } else if (a === "--documento" || a === "-d") {
      documento = args[++i] || "";
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else if (a.startsWith("-")) {
      throw new Error(`Argumento desconhecido: ${a}`);
    }
  }

  if (!tipo || !documento) {
    printUsage();
    throw new Error("Informe --tipo e --documento.");
  }

  return { tipo, documento, dryRun };
}
