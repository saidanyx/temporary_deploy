const { normalizeNetwork, validateAddress } = require("../src/services/withdrawals");

describe("withdrawals address/network validation", () => {
  test("normalizeNetwork accepts TRC20/ERC20 case-insensitively", () => {
    expect(normalizeNetwork("trc20")).toBe("TRC20");
    expect(normalizeNetwork("ERC20")).toBe("ERC20");
  });

  test("normalizeNetwork rejects unknown network", () => {
    expect(() => normalizeNetwork("bep20")).toThrow();
  });

  test("validateAddress validates TRC20 addresses", () => {
    const ok = "T" + "1".repeat(33);
    expect(validateAddress("TRC20", ok)).toBe(ok);
    expect(() => validateAddress("TRC20", "0x" + "a".repeat(40))).toThrow();
  });

  test("validateAddress validates ERC20 addresses", () => {
    const ok = "0x" + "a".repeat(40);
    expect(validateAddress("ERC20", ok)).toBe(ok);
    expect(() => validateAddress("ERC20", "T" + "1".repeat(33))).toThrow();
  });
});
