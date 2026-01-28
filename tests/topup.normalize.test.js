const { normalizeTopupParams } = require("../src/services/topup");

describe("topup normalizeTopupParams", () => {
  test("allows only USDT (case-insensitive)", () => {
    expect(normalizeTopupParams(100, "usdt")).toEqual({ amountRub: 100, currency: "USDT" });
    expect(() => normalizeTopupParams(100, "btc")).toThrow(/только валюта USDT/i);
  });

  test("validates amount (positive integer, <= 10000)", () => {
    expect(() => normalizeTopupParams("abc", "USDT")).toThrow();
    expect(() => normalizeTopupParams(0, "USDT")).toThrow(/больше 0/i);
    expect(() => normalizeTopupParams(-1, "USDT")).toThrow();

    // truncates decimals
    expect(normalizeTopupParams(123.99, "USDT")).toEqual({ amountRub: 123, currency: "USDT" });

    expect(() => normalizeTopupParams(10001, "USDT")).toThrow(/максимум 10000/i);
  });
});
