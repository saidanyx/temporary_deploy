// tests/referrals.compute.test.js

jest.mock("../src/services/wallets", () => ({
  updateBalance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/services/ledger", () => ({
  addLedgerEntry: jest.fn().mockResolvedValue(undefined),
}));

global.prisma = {}; // prevent getPrisma() from requiring DATABASE_URL in unit tests

const { computeReferralBonus, calculateReferralBonus } = require("../src/services/referrals");
const { updateBalance } = require("../src/services/wallets");
const { addLedgerEntry } = require("../src/services/ledger");

describe("referrals", () => {
  test("computeReferralBonus PERCENT", () => {
    expect(
      computeReferralBonus({ mode: "PERCENT", percent: 7.5, fixAmount: 0, lossAmount: 1000 })
    ).toBe(75);
  });

  test("computeReferralBonus FIX", () => {
    expect(computeReferralBonus({ mode: "FIX", percent: 0, fixAmount: 20, lossAmount: 1000 })).toBe(20);
  });

  test("calculateReferralBonus reads referrer settings and credits only on loss", async () => {
    const tx = {
      users: {
        findUnique: jest
          .fn()
          // first: losing user → referrer_id
          .mockResolvedValueOnce({ referrer_id: 10n })
          // second: referrer row
          .mockResolvedValueOnce({ id: 10n, ref_mode: "PERCENT", ref_percent: 5, ref_fix_amount: 0 }),
      },
      referral_bonuses: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    const res = await calculateReferralBonus(1n, 1000, tx);
    expect(res.ok).toBe(true);
    expect(res.bonus).toBe(50);

    expect(tx.referral_bonuses.create).toHaveBeenCalled();
    expect(addLedgerEntry).toHaveBeenCalledWith(
      10n,
      "REFERRAL",
      50,
      "REAL",
      expect.objectContaining({ referral_id: 1n, loss_amount: 1000 }),
      tx
    );
    expect(updateBalance).toHaveBeenCalledWith(10n, 50, tx);
  });

  test("calculateReferralBonus skips if no referrer", async () => {
    const tx = {
      users: {
        findUnique: jest.fn().mockResolvedValueOnce({ referrer_id: null }),
      },
    };

    const res = await calculateReferralBonus(1n, 1000, tx);
    expect(res.ok).toBe(true);
    expect(res.skipped).toBe("no_referrer");
  });
});
