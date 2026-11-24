import { describe, expect, it } from "vitest";
import { PASTELS, pastelFor, personInitials, toolMonogram } from "@/lib/monogram";

describe("toolMonogram", () => {
  it.each([
    ["Clay", "Cl"],
    ["n8n", "N8"],
    ["RB2B", "Rb"],
    ["11x", "11"],
    ["A/B Tasty", "Ab"],
    ["X", "X"],
    ["Élan", "Él"],
    ["", "?"],
    ["!!!", "?"],
  ])("%s -> %s", (name, expected) => {
    expect(toolMonogram(name)).toBe(expected);
  });
});

describe("personInitials", () => {
  it.each([
    ["Michel Lieben", "ML"],
    ["coldiq", "C"],
    ["demo_ana", "DA"],
    ["Zayd Syed Ali", "ZS"],
    ["  spaced   out ", "SO"],
    ["", "?"],
    ["🙂", "?"],
  ])("%s -> %s", (name, expected) => {
    expect(personInitials(name)).toBe(expected);
  });
});

describe("pastelFor", () => {
  it("is always one of the pastels, whatever the name", () => {
    for (const name of ["", "Clay", "n8n", "🙂", "a".repeat(5000), "Ünïcödé"]) {
      expect(PASTELS).toContain(pastelFor(name));
    }
  });

  it("is the same for the same name, ignoring case", () => {
    expect(pastelFor("HubSpot")).toBe(pastelFor("hubspot"));
  });

  it("uses more than one pastel", () => {
    const names = ["Clay", "n8n", "Instantly", "HubSpot", "HeyReach", "Trigify", "Apollo.io", "Slack"];
    expect(new Set(names.map(pastelFor)).size).toBeGreaterThan(2);
  });
});
