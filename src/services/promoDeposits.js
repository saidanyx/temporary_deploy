// src/services/promoDeposits.js
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function now() {
  return new Date();
}

async function addBonusLedger(userId, amount, meta, tx) {
  await tx.ledger.create({
    data: {
      user_id: userId,
      type: "BONUS",
      amount,
      meta: meta ?? undefined,
    },
  });
}

class PromoDepositsService {
  async createPromo({ name, code, percent, ttlDays }) {
    const promoCode = normalizeCode(code);
    const pct = Number(percent);
    const days = Number(ttlDays);

    if (!promoCode) throw new Error("Промокод пустой");
    if (!name || !String(name).trim()) throw new Error("Название пустое");
    if (!pct || Number.isNaN(pct) || pct <= 0) throw new Error("Процент должен быть > 0");
    if (!days || Number.isNaN(days) || days <= 0) throw new Error("TTL (дни) должен быть > 0");

    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    return prisma.promo_deposit_bonuses.create({
      data: {
        name: String(name).trim(),
        code: promoCode,
        percent: pct,
        expires_at: expiresAt,
      },
    });
  }

  async getPromoByCode(code) {
    const promoCode = normalizeCode(code);
    if (!promoCode) return null;
    return prisma.promo_deposit_bonuses.findUnique({ where: { code: promoCode } });
  }

  async activatePromoForUser(userId, code) {
    const promo = await this.getPromoByCode(code);
    if (!promo) return { ok: false, reason: "Промокод невалиден" };
    if (promo.expires_at && new Date(promo.expires_at) <= now()) return { ok: false, reason: "Промокод истёк" };

    const exists = await prisma.promo_deposit_claims.findUnique({
      where: { user_id_promo_id: { user_id: userId, promo_id: promo.id } },
    });
    if (exists) return { ok: false, reason: "Промокод уже использован" };

    const activeCount = await prisma.promo_deposit_claims.count({ where: { user_id: userId, status: "ACTIVATED" } });

    const status = activeCount >= 2 ? "QUEUED" : "ACTIVATED";

    await prisma.promo_deposit_claims.create({
      data: {
        user_id: userId,
        promo_id: promo.id,
        status,
        amount: 0,
        activated_at: new Date(),
      },
    });

    return { ok: true, promo, status };
  }

  async awardPromoBonusIfEligible(userId, depositId, depositAmountRub) {
    const amountRub = Number(depositAmountRub);
    if (!amountRub || Number.isNaN(amountRub) || amountRub <= 0) return null;

    const alreadyForDeposit = await prisma.promo_deposit_claims.findFirst({
      where: { deposit_id: depositId },
    });
    if (alreadyForDeposit) return null;

    const claims = await prisma.promo_deposit_claims.findMany({
      where: { user_id: userId, status: "ACTIVATED" },
      orderBy: { activated_at: "asc" },
      include: { promo: true },
    });
    if (!claims.length) return null;

    const nowDate = now();
    let selected = null;

    for (const c of claims) {
      if (!c.promo) continue;
      if (c.promo.expires_at && new Date(c.promo.expires_at) <= nowDate) {
        await prisma.promo_deposit_claims.update({
          where: { id: c.id },
          data: { status: "EXPIRED" },
        });
        continue;
      }
      selected = c;
      break;
    }

    if (!selected) {
      // maybe we expired some active promos, try to promote from queue and select again
      await this.ensureTwoActivePromos(userId);
      const again = await prisma.promo_deposit_claims.findFirst({
        where: { user_id: userId, status: "ACTIVATED" },
        orderBy: { activated_at: "asc" },
        include: { promo: true },
      });
      if (!again || !again.promo) return null;
      selected = again;
    }

    const percent = Number(selected.promo.percent);
    const bonusAmount = Number(((amountRub * percent) / 100).toFixed(2));
    if (!bonusAmount || bonusAmount <= 0) return null;

    await prisma.$transaction(async (tx) => {
      await tx.promo_deposit_claims.update({
        where: { id: selected.id },
        data: {
          status: "CLAIMED",
          deposit_id: depositId,
          amount: bonusAmount,
          used_at: new Date(),
        },
      });

      await tx.wallets.upsert({
        where: { user_id: userId },
        create: { user_id: userId, balance_real: bonusAmount },
        update: { balance_real: { increment: bonusAmount } },
      });

      await addBonusLedger(
        userId,
        bonusAmount,
        {
          kind: "PROMO_DEPOSIT_PERCENT",
          promo_id: selected.promo.id,
          promo_code: selected.promo.code,
          percent,
          deposit_id: depositId,
          deposit_amount: amountRub,
        },
        tx
      );
      await this.ensureTwoActivePromos(userId, tx);
    });

    return { amount: bonusAmount, promo_code: selected.promo.code, percent };
  }

  
  async ensureTwoActivePromos(userId, tx = prisma) {
    // Maintain at most 2 ACTIVE promos; others stay QUEUED (FIFO by activated_at)
    const activeCount = await tx.promo_deposit_claims.count({
      where: { user_id: userId, status: "ACTIVATED" },
    });

    let need = Math.max(0, 2 - activeCount);
    if (!need) return;

    const queued = await tx.promo_deposit_claims.findMany({
      where: { user_id: userId, status: "QUEUED" },
      orderBy: { activated_at: "asc" },
      take: need,
    });

    for (const q of queued) {
      await tx.promo_deposit_claims.update({
        where: { id: q.id },
        data: { status: "ACTIVATED" },
      });
    }
  }

async listAllUserTgIds() {
    const rows = await prisma.users.findMany({
      select: { tg_id: true },
      where: { is_banned: false },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => Number(r.tg_id)).filter((x) => Number.isFinite(x) && x > 0);
  }
}

const promoDepositsService = new PromoDepositsService();
module.exports = { promoDepositsService };
