import { describe, expect, it } from "vitest";
import { parseQuickEntry, readQuickEntry } from "./quickEntry.ts";

const amount = (text: string) => parseQuickEntry(text).amount;

describe("quick entry", () => {
  it("reads digits the way people write them", () => {
    expect(parseQuickEntry("taxi 2000")).toEqual({ amount: "2000", direction: null, note: "taxi" });
    expect(amount("taxi 2 000")).toBe("2000");
    expect(amount("loyer 75.000 F")).toBe("75000");
    expect(amount("pain 1 500 FCFA")).toBe("1500");
    expect(amount("café 2,5")).toBe("2.5");
    expect(amount("coffee 25k")).toBe("25000");
    expect(amount("moto 2,5k")).toBe("2500");
    expect(amount("terrain 1,2 million")).toBe("1200000");
    expect(amount("ciment 3 mille")).toBe("3000");
  });

  it("reads French number words as dictation writes them", () => {
    expect(amount("taxi deux mille francs")).toBe("2000");
    expect(amount("deux mille cinq cents pour le marché")).toBe("2500");
    expect(amount("salaire deux cent cinquante mille")).toBe("250000");
    expect(amount("soixante-quinze mille")).toBe("75000");
    expect(amount("quatre-vingt-dix mille")).toBe("90000");
    expect(amount("quatre-vingts")).toBe("80");
    expect(amount("vingt et un mille")).toBe("21000");
    expect(amount("mille")).toBe("1000");
    expect(amount("un million deux cent mille")).toBe("1200000");
  });

  it("reads English number words", () => {
    expect(amount("lunch two thousand five hundred")).toBe("2500");
    expect(amount("rent one hundred and twenty thousand")).toBe("120000");
  });

  it("keeps the rest as the note, without currency words or connectors", () => {
    expect(parseQuickEntry("taxi deux mille francs").note).toBe("taxi");
    expect(parseQuickEntry("Taxi 2000").note).toBe("Taxi");
    expect(parseQuickEntry("deux mille cinq cents pour le marché").note).toBe("marché");
    expect(parseQuickEntry("J’ai payé 3000 F de crédit téléphone")).toEqual({ amount: "3000", direction: "expense", note: "crédit téléphone" });
    expect(parseQuickEntry("reçu 5000 de Moussa").note).toBe("Moussa");
    expect(parseQuickEntry("salaire 150000").note).toBe("salaire");
  });

  it("knows income from expense words, and says nothing otherwise", () => {
    expect(parseQuickEntry("salaire 150000").direction).toBe("income");
    expect(parseQuickEntry("reçu 5000 de Moussa").direction).toBe("income");
    expect(parseQuickEntry("dépensé 2000 taxi").direction).toBe("expense");
    expect(parseQuickEntry("taxi 2000").direction).toBeNull();
  });

  it("finds no amount when none was said", () => {
    expect(parseQuickEntry("taxi pour aller au marché")).toEqual({ amount: null, direction: null, note: "taxi pour aller au marché" });
    expect(parseQuickEntry("")).toEqual({ amount: null, direction: null, note: "" });
  });

  it("reads quantity times unit price and keeps the unit price as the other reading", () => {
    const [item] = readQuickEntry("2 pains à 250");
    expect(item).toMatchObject({ amount: "500", note: "2 pains", confidence: "sure", alternatives: ["250"] });
    expect(item?.reading).toEqual({ how: "quantity", value: 500, quantity: 2, unitPrice: 250 });
  });

  it("splits several purchases and shares a direction said once", () => {
    const items = readQuickEntry("j'ai payé taxi 500 et pain 250");
    expect(items.map((item) => [item.amount, item.direction, item.note])).toEqual([["500", "expense", "taxi"], ["250", "expense", "pain"]]);
    // The rest of the line, read after the first purchase is saved, starts at "pain".
    expect("j'ai payé taxi 500 et pain 250".slice(items[1]!.from)).toBe("pain 250");
  });

  it("asks when the amount is implausible for CFA francs, not for other currencies", () => {
    expect(readQuickEntry("2 taxis")[0]?.confidence).toBe("check");
    expect(readQuickEntry("café 2,5", { currency: "EUR" })[0]?.confidence).toBe("sure");
  });

  it("asks when income and expense words are both said", () => {
    const [item] = readQuickEntry("vendu riz payé transport 5000");
    expect(item?.direction).toBeNull();
    expect(item?.confidence).toBe("check");
  });

  it("names the word that decided the direction", () => {
    expect(readQuickEntry("j'ai paye le taxi 2000")[0]?.directionWord).toBe("paye");
    expect(readQuickEntry("Awa m'a remboursé 3000")[0]?.directionWord).toBe("remboursé");
  });

  it("gives the same reading every time", () => {
    const line = "Taxi, deux mille. Pain, cinq cents.";
    expect(readQuickEntry(line)).toEqual(readQuickEntry(line));
  });
});
