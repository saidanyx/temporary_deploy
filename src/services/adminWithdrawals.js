const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const { Prisma } = require("@prisma/client");
const { addLedgerEntry } = require("./ledger");

function toDec(n) {
  if (n instanceof Prisma.Decimal) return n;
  if (typeof n === "bigint") return new Prisma.Decimal(n.toString());
  if (typeof n === "number") {
    if (!Number.isFinite(n)) throw new Error("Некорректная сумма");
    return new Prisma.Decimal(n);
  }
  const s = String(n ?? "").trim();
  if (!s) throw new Error("Некорректная сумма");
  return new Prisma.Decimal(s);
}

function calcTotal(amount, commission) {
  return toDec(amount).plus(toDec(commission));
}

const adminWithdrawalsService = {
  /**
   * Marks withdrawal as COMPLETED after admin manually paid it.
   * NOTE: callback_data is still admin:withdrawals:approve:<id> for backward compatibility.
   */
  async approve(withdrawalId) {
    return prisma.$transaction(async (tx) => {
      const w = await tx.withdrawals.findUnique({ where: { id: withdrawalId } });
      if (!w) throw new Error("Withdrawal not found");
      if (w.status !== "PENDING") throw new Error("Not in PENDING");

      const total = calcTotal(w.amount, w.commission);

      // Reserved money becomes spent when marked completed
      await tx.wallets.update({
        where: { user_id: w.user_id },
        data: {
          balance_reserved: { decrement: total },
        },
      });

      const updated = await tx.withdrawals.update({
        where: { id: withdrawalId },
        data: {
          status: "COMPLETED",
          processed_at: new Date(),
          approved_at: new Date(),
        },
      });

      await addLedgerEntry(
        w.user_id,
        "WITHDRAW",
        total.neg(),
        "REAL",
        { withdrawal_id: w.id, action: "COMPLETE" },
        tx
      );

      // We no longer use payout_jobs (manual payments). Keep rows if any, but don't create them.
      return updated;
    });
  },

  /**
   * Rejects withdrawal and refunds reserved funds back to real balance.
   */
  async reject(withdrawalId, reason = "Rejected by admin") {
    return prisma.$transaction(async (tx) => {
      const w = await tx.withdrawals.findUnique({ where: { id: withdrawalId } });
      if (!w) throw new Error("Withdrawal not found");
      if (w.status !== "PENDING") throw new Error("Not in PENDING");

      const total = calcTotal(w.amount, w.commission);

      await tx.withdrawals.update({
        where: { id: withdrawalId },
        data: { status: "REJECTED", rejected_at: new Date(), fail_reason: reason },
      });

      await tx.wallets.update({
        where: { user_id: w.user_id },
        data: {
          balance_reserved: { decrement: total },
          balance_real: { increment: total },
        },
      });

      await addLedgerEntry(
        w.user_id,
        "WITHDRAW",
        total,
        "REAL",
        { withdrawal_id: w.id, reason, action: "REFUND" },
        tx
      );

      return true;
    });
  },
};

module.exports = { adminWithdrawalsService };
