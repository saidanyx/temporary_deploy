// src/services/bonuses.js
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

const BONUS_STATES = {
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  ACTIVATED: "ACTIVATED",
};

async function getAdminChannels() {
  const { adminService } = require("./admin");
  return {
    game: await adminService.getGamesChannelChatId(),
    payments: await adminService.getPaymentsChannelChatId(),
  };
}

function isMemberStatusOk(status) {
  return status === "creator" || status === "administrator" || status === "member";
}

async function checkUserSubscriptions(botApi, tgUserId) {
  const channels = await getAdminChannels();
  const list = [channels.game, channels.payments].filter(Boolean);

  if (list.length < 2) return { ok: false, reason: "Админ не настроил каналы для проверки подписки" };
  if (!botApi) {
    return { ok: false, reason: "Нажмите «Проверить условия»" };
  }

  for (const ch of list) {
    try {
      const member = await botApi.getChatMember(ch, tgUserId);
      if (!isMemberStatusOk(member?.status)) {
        return { ok: false, reason: `Подпишитесь на все каналы: ${list.join(", ")}` };
      }
    } catch (e) {
      return {
        ok: false,
        reason: `Не удалось проверить подписку для ${ch}. Проверь: ссылка публичная и бот админ канала.`,
      };
    }
  }

  return { ok: true };
}

// чаще маленькие, реже большие
function randomDailyAmount(min = 10, max = 5000) {
  const buckets = [
    { from: 10, to: 50, weight: 40 },
    { from: 51, to: 150, weight: 30 },
    { from: 151, to: 500, weight: 18 },
    { from: 501, to: 1500, weight: 8 },
    { from: 1501, to: 5000, weight: 4 },
  ];

  const filtered = buckets
    .map((b) => ({ ...b, from: Math.max(b.from, min), to: Math.min(b.to, max) }))
    .filter((b) => b.from <= b.to && b.weight > 0);

  if (!filtered.length) return Math.floor(min + Math.random() * (max - min + 1));

  const total = filtered.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;

  for (const b of filtered) {
    r -= b.weight;
    if (r <= 0) return Math.floor(b.from + Math.random() * (b.to - b.from + 1));
  }

  const last = filtered[filtered.length - 1];
  return Math.floor(last.from + Math.random() * (last.to - last.from + 1));
}

function todayBerlinDate() {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  }
}

async function enqueueNotification(userId, type, payload, tx) {
  // важно: если таблицы нет / prisma client не обновлён, tx.notifications_outbox будет undefined
  if (!tx.notifications_outbox) return;
  await tx.notifications_outbox.create({
    data: {
      user_id: userId,
      type,
      payload: payload ?? undefined,
      status: "PENDING",
      attempts: 0,
    },
  });
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

class BonusesService {
  /**
   * Возвращаем список бонусов для меню.
   * ✅ Для DEPOSIT_15_NEWBIE: если недоступен — НЕ возвращаем вообще (пропадает из меню).
   */
  async getUserBonuses(userId) {
    const allBonuses = await prisma.bonuses.findMany({
      where: { is_active: true },
      orderBy: { created_at: "desc" },
    });

    const claims = await prisma.bonus_claims.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });

    const paidCount = await prisma.deposits.count({
      where: { user_id: userId, status: "PAID" },
    });

    const today = todayBerlinDate().toISOString().slice(0, 10);

    const mapped = allBonuses.map((b) => {
      let state = BONUS_STATES.AVAILABLE;

      if (b.type === "DEPOSIT_15_NEWBIE") {
        // ✅ Вариант A: доступен только ДО первого PAID депозита и пока не активирован/не получен.
        const hasAny = claims.some((c) => c.bonus_type === "DEPOSIT_15_NEWBIE");
        state = paidCount === 0 && !hasAny ? BONUS_STATES.AVAILABLE : BONUS_STATES.UNAVAILABLE;
      }

      if (b.type === "DAILY_RANDOM_10_5000") {
        const alreadyToday = claims.some(
          (c) =>
            c.bonus_type === "DAILY_RANDOM_10_5000" &&
            c.day &&
            new Date(c.day).toISOString().slice(0, 10) === today
        );
        state = alreadyToday ? BONUS_STATES.ACTIVATED : BONUS_STATES.AVAILABLE;
      }

      return { ...b, user_state: state, config: b.config || {} };
    });

    // ✅ скрываем недоступный депозитный бонус из меню
    return mapped.filter((b) => {
      // ✅ бонусы "одноразовые": после активации/получения скрываем из меню
      if (b.type === "DEPOSIT_15_NEWBIE") return b.user_state === BONUS_STATES.AVAILABLE;
      if (b.type === "DAILY_RANDOM_10_5000") return b.user_state === BONUS_STATES.AVAILABLE;
      return true;
    });
  }

  /**
   * Проверка условий (для экрана деталей).
   * Для DEPOSIT_15_NEWBIE — теперь это "можно ли активировать".
   */
  async checkBonusConditions(userId, bonus, botApi = null, tgUserId = null) {
    if (bonus.type === "DEPOSIT_15_NEWBIE") {
      // Уже активирован или получен?
      const any = await prisma.bonus_claims.findFirst({
        where: { user_id: userId, bonus_type: "DEPOSIT_15_NEWBIE" },
        orderBy: { created_at: "desc" },
      });
      if (any) {
        if (any.status === "ACTIVATED") return { eligible: false, reason: "✅ Бонус уже активирован (ждём депозит)" };
        return { eligible: false, reason: "✅ Бонус уже получен" };
      }

      // Уже был депозит PAID?
      const paidCount = await prisma.deposits.count({
        where: { user_id: userId, status: "PAID" },
      });
      if (paidCount > 0) {
        return { eligible: false, reason: "Бонус доступен только до первого депозита" };
      }

      // ✅ можно активировать
      return { eligible: true };
    }

    if (bonus.type === "DAILY_RANDOM_10_5000") {
      if (!botApi || !tgUserId) {
        return { eligible: false, reason: "Нажмите «Проверить условия»" };
      }

      const subs = await checkUserSubscriptions(botApi, tgUserId);
      if (!subs.ok) return { eligible: false, reason: subs.reason };

      const today = todayBerlinDate();
      const already = await prisma.bonus_claims.findFirst({
        where: { user_id: userId, bonus_type: "DAILY_RANDOM_10_5000", day: today },
      });
      if (already) return { eligible: false, reason: "Вы уже получили ежедневный бонус сегодня" };

      return { eligible: true };
    }

    return { eligible: false, reason: "Неизвестный тип бонуса" };
  }

  async getBonusDetails(userId, bonusId, botApi = null, tgUserId = null) {
    const bonus = await prisma.bonuses.findUnique({ where: { id: bonusId } });
    if (!bonus) throw new Error("Бонус не найден");

    // факт получения/активации (для статуса)
    let activated = false;
    let waitingDeposit = false;

    if (bonus.type === "DEPOSIT_15_NEWBIE") {
      const claim = await prisma.bonus_claims.findFirst({
        where: { user_id: userId, bonus_type: "DEPOSIT_15_NEWBIE" },
        orderBy: { created_at: "desc" },
      });

      if (claim) {
        if (claim.status === "ACTIVATED") waitingDeposit = true;
        else activated = true; // CLAIMED
      }
    }

    if (bonus.type === "DAILY_RANDOM_10_5000") {
      const claim = await prisma.bonus_claims.findFirst({
        where: { user_id: userId, bonus_type: "DAILY_RANDOM_10_5000", day: todayBerlinDate() },
      });
      activated = !!claim;
    }

    const eligibility = await this.checkBonusConditions(userId, bonus, botApi, tgUserId);

    let user_state = BONUS_STATES.AVAILABLE;

    if (bonus.type === "DEPOSIT_15_NEWBIE") {
      if (activated || waitingDeposit) user_state = BONUS_STATES.ACTIVATED;
      else user_state = eligibility.eligible ? BONUS_STATES.AVAILABLE : BONUS_STATES.UNAVAILABLE;
    } else {
      if (activated) user_state = BONUS_STATES.ACTIVATED;
      else user_state = eligibility.eligible ? BONUS_STATES.AVAILABLE : BONUS_STATES.UNAVAILABLE;
    }

    return {
      ...bonus,
      user_state,
      eligible: eligibility.eligible,
      ineligibility_reason: eligibility.reason,
    };
  }

  async activateBonus(userId, bonusId, botApi = null, tgUserId = null) {
    const bonus = await prisma.bonuses.findUnique({ where: { id: bonusId } });
    if (!bonus) throw new Error("Бонус не найден");

    // ✅ DEPOSIT_15_NEWBIE теперь активируемый (вариант A)
    if (bonus.type === "DEPOSIT_15_NEWBIE") {
      const eligibility = await this.checkBonusConditions(userId, bonus, botApi, tgUserId);
      if (!eligibility.eligible) throw new Error(eligibility.reason);

      // защита от двойной активации (на случай гонок)
      const exists = await prisma.bonus_claims.findFirst({
        where: { user_id: userId, bonus_type: "DEPOSIT_15_NEWBIE" },
      });
      if (exists) throw new Error("Бонус уже активирован или получен");

      const cfg = bonus.config || {};
      const percent = Number(cfg.percent ?? 15);

      await prisma.bonus_claims.create({
        data: {
          user_id: userId,
          bonus_type: "DEPOSIT_15_NEWBIE",
          status: "ACTIVATED",
          amount: 0,
          meta: { percent },
        },
      });

      return { ok: true };
    }

    // --- Daily bonus ---
    const eligibility = await this.checkBonusConditions(userId, bonus, botApi, tgUserId);
    if (!eligibility.eligible) throw new Error(eligibility.reason);

    const cfg = bonus.config || {};
    const min = Number(cfg.min ?? 10);
    const max = Number(cfg.max ?? 5000);
    const amount = randomDailyAmount(min, max);
    const day = todayBerlinDate();

    await prisma.$transaction(async (tx) => {
      await tx.bonus_claims.create({
        data: {
          user_id: userId,
          bonus_type: "DAILY_RANDOM_10_5000",
          day,
          amount,
          status: "CLAIMED",
          meta: { min, max },
        },
      });

      await tx.wallets.upsert({
        where: { user_id: userId },
        create: { user_id: userId, balance_real: amount },
        update: { balance_real: { increment: amount } },
      });

      await addBonusLedger(userId, amount, { bonus_type: bonus.type, bonus_id: bonus.id }, tx);
      await enqueueNotification(userId, "BONUS_DAILY_CLAIMED", { amount, bonus_id: bonus.id }, tx);
    });

    return { amount };
  }

  /**
   * Вызывается из deposits.js после PAID.
   * Вариант A: начисляем процент ТОЛЬКО если пользователь ранее нажал "Активировать"
   */
  async awardDepositBonusIfEligible(userId, depositId, depositAmountRub) {
    const bonus = await prisma.bonuses.findUnique({ where: { type: "DEPOSIT_15_NEWBIE" } });
    if (!bonus || bonus.is_active === false) return null;

    // уже выдавали на этот депозит (идемпотентность)
    const already = await prisma.bonus_claims.findFirst({
      where: { bonus_type: "DEPOSIT_15_NEWBIE", deposit_id: depositId },
    });
    if (already) return null;

    // ✅ нужен ACTIVATED claim (ожидание депозита)
    const activated = await prisma.bonus_claims.findFirst({
      where: {
        user_id: userId,
        bonus_type: "DEPOSIT_15_NEWBIE",
        status: "ACTIVATED",
        deposit_id: null,
      },
      orderBy: { created_at: "desc" },
    });
    if (!activated) return null;

    // это реально первый PAID депозит?
    const paidCountBefore = await prisma.deposits.count({
      where: { user_id: userId, status: "PAID", NOT: { id: depositId } },
    });
    if (paidCountBefore > 0) return null;

    const cfg = bonus.config || {};
    const percent = Number(cfg.percent ?? activated?.meta?.percent ?? 15);
    const amount = Number(((Number(depositAmountRub) * percent) / 100).toFixed(2));
    if (!amount || amount <= 0) return null;

    await prisma.$transaction(async (tx) => {
      // ✅ обновляем активированный claim → CLAIMED
      await tx.bonus_claims.update({
        where: { id: activated.id },
        data: {
          deposit_id: depositId,
          amount,
          status: "CLAIMED",
          meta: { ...(activated.meta || {}), percent, deposit_amount: depositAmountRub },
        },
      });

      await tx.wallets.upsert({
        where: { user_id: userId },
        create: { user_id: userId, balance_real: amount },
        update: { balance_real: { increment: amount } },
      });

      await addBonusLedger(userId, amount, { bonus_type: bonus.type, bonus_id: bonus.id }, tx);
      await enqueueNotification(userId, "BONUS_DEPOSIT_AWARDED", { amount, bonus_id: bonus.id }, tx);
    });

    return { amount };
  }
}

const bonusesService = new BonusesService();

async function adminSetDepositPercent(percent) {
  const p = Number(String(percent).replace(",", "."));
  if (!Number.isFinite(p) || p <= 0) throw new Error("Процент должен быть числом > 0");
  if (p > 1000) throw new Error("Слишком большой процент (макс 1000)");

  const bonus = await prisma.bonuses.findUnique({ where: { type: "DEPOSIT_15_NEWBIE" } });
  if (!bonus) throw new Error("Бонус DEPOSIT_15_NEWBIE не найден (проверь seed)");

  const cfg = bonus.config && typeof bonus.config === "object" ? bonus.config : {};
  await prisma.bonuses.update({
    where: { id: bonus.id },
    data: { config: { ...cfg, percent: p } },
  });

  return { ok: true, percent: p };
}

async function adminSetDailyRange(min, max) {
  const mn = Number(String(min).replace(",", "."));
  const mx = Number(String(max).replace(",", "."));
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) throw new Error("Min/Max должны быть числами");
  if (mn <= 0 || mx <= 0) throw new Error("Min/Max должны быть > 0");
  if (mn > mx) throw new Error("Min не может быть больше Max");
  if (mx > 1000000) throw new Error("Слишком большой Max (макс 1 000 000)");

  const bonus = await prisma.bonuses.findUnique({ where: { type: "DAILY_RANDOM_10_5000" } });
  if (!bonus) throw new Error("Бонус DAILY_RANDOM_10_5000 не найден (проверь seed)");

  const cfg = bonus.config && typeof bonus.config === "object" ? bonus.config : {};
  await prisma.bonuses.update({
    where: { id: bonus.id },
    data: { config: { ...cfg, min: mn, max: mx } },
  });

  return { ok: true, min: mn, max: mx };
}


module.exports = { bonusesService, BONUS_STATES, adminSetDepositPercent, adminSetDailyRange };
