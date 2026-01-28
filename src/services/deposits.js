"use strict";

// src/services/deposits.js
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

const cryptoBot = require("./cryptobot");
const { updateBalance } = require("./wallets");
const { addLedgerEntry } = require("./ledger");
const { bonusesService } = require("./bonuses");
const { promoDepositsService } = require("./promoDeposits");

function toNumber(x) {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "bigint") return Number(x);
  if (typeof x === "string") return Number(x);
  if (typeof x?.toNumber === "function") return x.toNumber();
  if (typeof x?.toString === "function") return Number(x.toString());
  return Number(x);
}

function normalizeAsset(asset) {
  return String(asset || "").trim().toUpperCase();
}

async function createDeposit(userId, amountRub, invoiceId, payloadMeta, currency = "USDT") {
  const rub = toNumber(amountRub);
  if (!Number.isFinite(rub) || rub <= 0) throw new Error("Invalid deposit amount (RUB)");
  const cur = normalizeAsset(currency) || "USDT";
  if (cur !== "USDT") throw new Error("Only USDT deposits are supported");

  const dep = await prisma.deposits.create({
    data: {
      user_id: userId,
      provider: "CRYPTOBOT",
      invoice_id: String(invoiceId),
      amount: rub,
      payload: payloadMeta ?? undefined,
      status: "PENDING",
      currency: cur,
    },
  });

  return { ...dep, amount: toNumber(dep.amount) };
}

/**
 * Process CryptoBot invoice:
 * - credits REAL balance in ₽ *only once*
 * - writes ledger (DEPOSIT, delta)
 * - marks deposit PAID only after successful credit+ledger
 *
 * NOTE: provider is polled periodically (see src/index.js)
 */
async function processDeposit(invoiceId) {
  const invId = String(invoiceId);

  // 1) Fetch provider status outside DB tx (don't hold locks during HTTP)
  let invoice;
  try {
    invoice = await cryptoBot.getInvoiceStatus(invId);
  } catch (e) {
    console.error("Error fetching invoice status:", e);
    return;
  }

  const status = String(invoice?.status || "").toLowerCase();
  if (status !== "paid") {
    // still pending / expired / etc.
    return;
  }

  const asset = normalizeAsset(invoice?.asset);
  if (asset && asset !== "USDT") {
    // We asked provider for USDT invoices, but guard anyway.
    try {
      await prisma.deposits.updateMany({
        where: { provider: "CRYPTOBOT", invoice_id: invId, status: "PENDING" },
        data: { status: "FAILED", currency: asset || "UNKNOWN", updated_at: new Date() },
      });
    } catch {}
    console.warn(`Invoice ${invId} paid with unsupported asset: ${asset}`);
    return;
  }

  const paidUsd = toNumber(invoice?.amount);
  if (!Number.isFinite(paidUsd) || paidUsd <= 0) {
    console.warn(`Invoice ${invId} has invalid amount: ${invoice?.amount}`);
    return;
  }

  // Convert USD→RUB (we treat USDT ~= USD)
  let rub;
  try {
    rub = toNumber(await cryptoBot.convertUSDToRUB(paidUsd));
  } catch (e) {
    console.error("Error converting USD→RUB:", e);
    return;
  }
  if (!Number.isFinite(rub) || rub <= 0) {
    console.warn(`Invoice ${invId} conversion produced invalid RUB: ${rub}`);
    return;
  }

  // 2) Atomic DB transaction with row lock to prevent double credit
  const txResult = await prisma.$transaction(async (tx) => {
    // Lock deposit row (prevents concurrent workers double-processing the same invoice)
    await tx.$queryRaw`SELECT id FROM deposits WHERE provider='CRYPTOBOT' AND invoice_id=${invId} FOR UPDATE`;

    const deposit = await tx.deposits.findFirst({
      where: { provider: "CRYPTOBOT", invoice_id: invId },
    });

    if (!deposit) return { ok: false, reason: "not_found" };

    if (deposit.status === "PAID") return { ok: true, alreadyPaid: true, depositId: deposit.id, userId: deposit.user_id };

    // Credit balance + ledger, then mark PAID (all in one tx)
    await updateBalance(deposit.user_id, rub, tx);

    const prevPayload = deposit.payload && typeof deposit.payload === "object" ? deposit.payload : {};
    const nextPayload = {
      ...prevPayload,
      paid: { amount: paidUsd, asset: "USDT" },
      credited_rub: rub,
    };

    await addLedgerEntry(
      deposit.user_id,
      "DEPOSIT",
      rub,
      "REAL",
      { provider: "CRYPTOBOT", invoice_id: invId, deposit_id: deposit.id, paid_usdt: paidUsd, credited_rub: rub },
      tx
    );

    await tx.deposits.update({
      where: { id: deposit.id },
      data: {
        status: "PAID",
        paid_at: new Date(),
        currency: "USDT",
        payload: nextPayload,
        updated_at: new Date(),
      },
    });

    return { ok: true, alreadyPaid: false, depositId: deposit.id, userId: deposit.user_id, rub };
  });

  if (!txResult?.ok) {
    if (txResult?.reason === "not_found") {
      console.log(`Deposit not found for invoiceId: ${invId}`);
    }
    return;
  }

  // 3) Bonuses: safe to run outside tx (idempotent via unique constraints)
  try {
    const depId = txResult.depositId;
    const userId = txResult.userId;
    const rubValue = txResult.rub ?? rub;

    await bonusesService.awardDepositBonusIfEligible(userId, depId, rubValue);
    await promoDepositsService.awardPromoBonusIfEligible(userId, depId, rubValue);
  } catch (e) {
    console.error("Deposit bonus error:", e);
  }
}

module.exports = { createDeposit, processDeposit, toNumber };
