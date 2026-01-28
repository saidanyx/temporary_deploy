// tests/deposits.process.test.js

describe("deposits.processDeposit", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("credits balance and writes ledger exactly once (idempotent)", async () => {
    // Fake Prisma (used via global.prisma in getPrisma)
    const depositRow = {
      id: 1n,
      user_id: 42n,
      provider: "CRYPTOBOT",
      invoice_id: "inv1",
      status: "PENDING",
      payload: null,
    };

    const prisma = {
      $queryRaw: async function (strings, ...values) {
        // lock simulation: no-op
        return null;
      },
      deposits: {
        findFirst: async ({ where }) => {
          if (where.invoice_id === "inv1" && where.provider === "CRYPTOBOT") return depositRow;
          return null;
        },
        update: async ({ where, data }) => {
          if (where.id === 1n) Object.assign(depositRow, data);
          return depositRow;
        },
        updateMany: async () => ({ count: 0 }),
      },
      $transaction: async (fn) => fn(prisma),
    };

    global.prisma = prisma;

    // Mocks for dependencies
    const updateBalance = jest.fn().mockResolvedValue(undefined);
    const addLedgerEntry = jest.fn().mockResolvedValue(undefined);
    const awardDepositBonusIfEligible = jest.fn().mockResolvedValue(null);
    const awardPromoBonusIfEligible = jest.fn().mockResolvedValue(null);

    jest.doMock("../src/services/wallets", () => ({ updateBalance }));
    jest.doMock("../src/services/ledger", () => ({ addLedgerEntry }));
    jest.doMock("../src/services/bonuses", () => ({ bonusesService: { awardDepositBonusIfEligible } }));
    jest.doMock("../src/services/promoDeposits", () => ({ promoDepositsService: { awardPromoBonusIfEligible } }));
    jest.doMock("../src/services/cryptobot", () => ({
      getInvoiceStatus: jest.fn().mockResolvedValue({ status: "paid", asset: "USDT", amount: 10 }),
      convertUSDToRUB: jest.fn().mockResolvedValue(1000),
    }));

    const { processDeposit } = require("../src/services/deposits");

    await processDeposit("inv1");

    expect(updateBalance).toHaveBeenCalledTimes(1);
    expect(addLedgerEntry).toHaveBeenCalledTimes(1);
    expect(depositRow.status).toBe("PAID");

    // second run: should NOT double-credit
    await processDeposit("inv1");
    expect(updateBalance).toHaveBeenCalledTimes(1);
    expect(addLedgerEntry).toHaveBeenCalledTimes(1);
  });

  test("marks deposit FAILED on unsupported asset", async () => {
    const depositRow = {
      id: 2n,
      user_id: 1n,
      provider: "CRYPTOBOT",
      invoice_id: "inv2",
      status: "PENDING",
      payload: null,
    };

    const prisma = {
      deposits: {
        findFirst: async ({ where }) => {
          if (where.invoice_id === "inv2" && where.provider === "CRYPTOBOT") return depositRow;
          return null;
        },
        updateMany: async ({ data }) => {
          Object.assign(depositRow, data);
          return { count: 1 };
        },
      },
      $transaction: async (fn) => fn(prisma),
      $queryRaw: async function () {
        return null;
      },
    };

    global.prisma = prisma;

    jest.doMock("../src/services/cryptobot", () => ({
      getInvoiceStatus: jest.fn().mockResolvedValue({ status: "paid", asset: "BTC", amount: 10 }),
      convertUSDToRUB: jest.fn(),
    }));

    // no-op stubs
    jest.doMock("../src/services/wallets", () => ({ updateBalance: jest.fn() }));
    jest.doMock("../src/services/ledger", () => ({ addLedgerEntry: jest.fn() }));
    jest.doMock("../src/services/bonuses", () => ({ bonusesService: { awardDepositBonusIfEligible: jest.fn() } }));
    jest.doMock("../src/services/promoDeposits", () => ({ promoDepositsService: { awardPromoBonusIfEligible: jest.fn() } }));

    const { processDeposit } = require("../src/services/deposits");
    await processDeposit("inv2");

    expect(depositRow.status).toBe("FAILED");
  });
});
