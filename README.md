# SEMFAZ CND Assistente

Assistente local em **TypeScript + Playwright** para emitir a **Certidão Negativa de Débitos (CND)** no portal público da SEMFAZ Aracaju (`fazenda.aracaju.se.gov.br`), com resolução experimental do **reCAPTCHA v2** via **Gemini** (desafio de áudio por padrão; grade de imagens como alternativa).

> **Uso:** pensado para rodar no PC (browser visível), não em pipeline CI/CD. O portal é público — use volume razoável e respeite as regras internas da secretaria.
>
> **Limitação:** reconhecimento de CAPTCHA por IA não é garantido. Sem PDF capturado após **Emitir**, o processo encerra com código de saída `1`.

## Arquitetura

| Área | Papel |
|------|--------|
| `src/cli/` | Entrada CLI (`emitir`) e parse de argumentos |
| `src/config/` | Variáveis de ambiente (Zod) |
| `src/logger/` | Logs JSON com redação de segredos |
| `src/portal/` | Navegação, formulário Angular, reCAPTCHA, Gemini, captura do PDF |
| `tests/` | Testes unitários (Vitest) |

Fluxo resumido: abrir CND → CPF/CNPJ + documento → checkbox reCAPTCHA → áudio (MP3 → Gemini) → **Emitir** → salvar PDF (JSON da API, download ou popup/`blob:`).

## Requisitos

- Node.js 20+
- pnpm 9+
- Conta Google AI Studio (`GEMINI_API_KEY`)

## Setup

```bash
pnpm install
pnpm playwright:install
cp .env.example .env
```

Edite o `.env` e preencha `GEMINI_API_KEY`. A URL da CND no `.env` **precisa de aspas** (o `#` do hash route vira comentário no dotenv se ficar sem aspas).

## Uso

```bash
# Preenche + tenta captcha; não clica Emitir
pnpm emitir -- --tipo PF --documento 00000000000 --dry-run

# Emissão completa (tenta gravar o PDF em downloads/)
pnpm emitir -- --tipo PF --documento 00000000000
pnpm emitir -- --tipo PJ --documento 00000000000000
```

Artefatos locais (ignorados pelo git):

- `downloads/` — PDFs capturados
- `evidence/` — áudios/screenshots de diagnóstico

### Exit codes

| Código | Significado |
|--------|-------------|
| `0` | Dry-run OK, ou PDF da CND capturado após Emitir |
| `1` | Falha (args, captcha, formulário ou PDF não capturado) |

## Qualidade

```bash
pnpm typecheck
pnpm test
pnpm verify
```

## Variáveis de ambiente

Veja `.env.example`. Principais:

| Variável | Papel |
|----------|--------|
| `GEMINI_API_KEY` | Obrigatória |
| `GEMINI_MODEL` | Default `gemini-3.5-flash-lite` |
| `GEMINI_AUDIO_MODEL` | Default `gemini-2.5-flash` |
| `GEMINI_TIMEOUT_MS` | Timeout por chamada Gemini (default `45000`) |
| `PLAYWRIGHT_HEADLESS` | Default `false` |
| `RECAPTCHA_MODE` | `audio` (padrão) ou `tiles` |
| `RECAPTCHA_MAX_ROUNDS` | Tentativas por emissão |
| `RECAPTCHA_UPSCALE` | Amplia captura no modo tiles |
| `DOWNLOAD_DIR` | Pasta dos PDFs (default `downloads`) |

## Licença

Software proprietário, com todos os direitos reservados. Uso, cópia, modificação, distribuição ou exploração comercial dependem de autorização por escrito do titular. Os termos completos estão em [LICENSE](LICENSE).
