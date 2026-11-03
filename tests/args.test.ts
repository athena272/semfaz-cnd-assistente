import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";

describe("parseArgs", () => {
  it("aceita PF e documento", () => {
    expect(parseArgs(["--tipo", "PF", "--documento", "07380613529"])).toEqual({
      tipo: "PF",
      documento: "07380613529",
      dryRun: false,
    });
  });

  it("aceita aliases CPF e -d", () => {
    expect(parseArgs(["-t", "CPF", "-d", "07380613529", "--dry-run"])).toEqual({
      tipo: "PF",
      documento: "07380613529",
      dryRun: true,
    });
  });

  it("ignora -- solto do pnpm", () => {
    expect(parseArgs(["--", "--tipo", "PJ", "--documento", "11222333000181"])).toMatchObject({
      tipo: "PJ",
    });
  });

  it("rejeita tipo inválido", () => {
    expect(() => parseArgs(["--tipo", "XX", "--documento", "1"])).toThrow(/tipo inválido/);
  });

  it("rejeita flag desconhecida", () => {
    expect(() =>
      parseArgs(["--tipo", "PF", "--documento", "07380613529", "--foo"]),
    ).toThrow(/desconhecido/);
  });

  it("exige tipo e documento", () => {
    expect(() => parseArgs([])).toThrow(/Informe --tipo e --documento/);
  });
});
