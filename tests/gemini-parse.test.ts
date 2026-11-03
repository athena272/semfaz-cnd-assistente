import { describe, expect, it } from "vitest";
import {
  buildGenerationConfig,
  modelsToTry,
  normalizeAudioAnswer,
  parseIndicesJson,
} from "../src/portal/gemini.js";

describe("normalizeAudioAnswer", () => {
  it("remove markdown e aspas", () => {
    expect(normalizeAudioAnswer('```\n"900"\n```')).toBe("900");
  });

  it("colapsa espaços", () => {
    expect(normalizeAudioAnswer("  one   two  ")).toBe("one two");
  });
});

describe("parseIndicesJson", () => {
  it("parseia índices válidos", () => {
    expect(parseIndicesJson('{"indices":[1,4,7]}', 9)).toEqual([1, 4, 7]);
  });

  it("ignora índices fora do range e duplicados", () => {
    expect(parseIndicesJson('{"indices":[1,1,99,-1,3]}', 9)).toEqual([1, 3]);
  });

  it("retorna null se não houver JSON", () => {
    expect(parseIndicesJson("sem json", 9)).toBeNull();
  });

  it("aceita JSON embutido em texto", () => {
    expect(parseIndicesJson('ok {"indices":[0,2]} fim', 4)).toEqual([0, 2]);
  });
});

describe("modelsToTry", () => {
  it("deduplica mantendo ordem", () => {
    expect(modelsToTry("a", ["b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("buildGenerationConfig", () => {
  it("usa thinkingLevel minimal em gemini-3", () => {
    const cfg = buildGenerationConfig("gemini-3.5-flash-lite");
    expect(cfg.thinkingConfig).toEqual({
      thinkingLevel: "minimal",
      includeThoughts: false,
    });
  });

  it("usa thinkingBudget 0 em 2.5", () => {
    const cfg = buildGenerationConfig("gemini-2.5-flash");
    expect(cfg.thinkingConfig).toEqual({
      thinkingBudget: 0,
      includeThoughts: false,
    });
  });
});
