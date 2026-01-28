// src/games/rocket.js
const { InlineKeyboard } = require("grammy");
const session = require("../state/session");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const { MESSAGES } = require("../ui/messages");
const IMAGES = require("../assets/images");
const { addWin, createWinLedger } = require("./checkingBalance");
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const { DEFAULTS, placeBet } = require("./betEngine");

const HOUSE_EDGE = 0.08;
const MIN_CRASH = 1.01;
const MAX_CRASH = 10000;

const LOOP_TICK_MS = 120;
const UI_EDIT_MS = 900;
const BET_COOLDOWN_MS = DEFAULTS.cooldownMs;
const PRECISION = 2;

const GROWTH_K = 0.185;

const rounds = new Map();

function rocketMainKeyboard() {
  return new InlineKeyboard()
    .text("🎮 Играть в боте", "rocket:play")
    .row()
    .text("⬅️ Назад", "nav:games");
}

function rocketRoundKeyboard() {
  return new InlineKeyboard().text("💰 Забрать", "rocket:cashout");
}

function formatRules() {
  return (
    "🚀 *ROCKET* 🚀\n\n" +
    "*Правила:*\n" +
    "• Ракета стартует с *1.00x*\n" +
    "• Коэффициент растёт в реальном времени\n" +
    "• Нажми *Забрать* до взрыва\n" +
    "• Не успел — ставка сгорает 💥\n\n" +
    "⚠️ Чем дольше ждёшь — тем выше риск."
  );
}

function formatBetCaption() {
  return "💰 *Выберите ставку:*";
}

function formatRoundCaption(mult, bet) {
  return (
    "🚀 *ROCKET* 🚀\n\n" +
    `Ставка: *${bet} ₽*\n` +
    `Текущий коэффициент: *${mult.toFixed(2)}x*\n\n` +
    "Нажми *Забрать* до взрыва 💥"
  );
}

function formatExplodedCaption(crashAt, bet) {
  return (
    "💥 *ВЗРЫВ!*\n\n" +
    `Ракета взорвалась на *${crashAt.toFixed(2)}x*\n` +
    `Ставка *${bet} ₽* сгорела 😢`
  );
}

function formatCashoutCaption(cashoutAt, bet, win) {
  return (
    "✅ *ВЫ ЗАБРАЛИ!*\n\n" +
    `Коэффициент: *${cashoutAt.toFixed(2)}x*\n` +
    `Ставка: *${bet} ₽*\n` +
    `Выигрыш: *${win} ₽* 🎉`
  );
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function floorToPrecision(x, digits = 2) {
  const k = Math.pow(10, digits);
  return Math.floor(x * k) / k;
}

function generateCrashMultiplier({ houseEdge = HOUSE_EDGE } = {}) {
  let u = Math.random();
  if (u === 0) u = Number.MIN_VALUE;

  let crash = (1 - houseEdge) / u;
  crash = clamp(crash, MIN_CRASH, MAX_CRASH);
  return floorToPrecision(crash, PRECISION);
}

function calcRawMultiplier(startedAt) {
  const t = (Date.now() - startedAt) / 1000;
  const raw = Math.exp(GROWTH_K * t);
  return raw < 1 ? 1 : raw;
}

async function editPhotoMessage(ctx, chatId, messageId, photo, caption, keyboard) {
  await ctx.api.editMessageMedia(
    chatId,
    messageId,
    {
      type: "photo",
      media: photo,
      caption,
      parse_mode: "Markdown",
    },
    keyboard ? { reply_markup: keyboard } : undefined
  );
}

async function sendPhotoMessage(ctx, photo, caption, keyboard) {
  return ctx.replyWithPhoto(photo, {
    caption,
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

async function stopRound(userId) {
  const r = rounds.get(userId);
  if (!r) return;
  r.stopped = true;
  rounds.delete(userId);
}

async function settleExplode(ctx, r) {
  if (r.settled) return;
  r.settled = true;
  rounds.delete(r.userId);

  try {
    if (r.chatId && r.messageId) {
      await editPhotoMessage(
        ctx,
        r.chatId,
        r.messageId,
        IMAGES.ROCKET,
        formatExplodedCaption(r.crashAt, r.bet),
        rocketMainKeyboard()
      );
    } else {
      await render(ctx, {
        photo: IMAGES.ROCKET,
        caption: formatExplodedCaption(r.crashAt, r.bet),
        keyboard: rocketMainKeyboard(),
        edit: true,
      });
    }
  } catch (_) {}

  try {
    await calculateReferralBonus(r.dbUserId, r.bet);
  } catch (e) {
    console.error("Referral bonus error:", e);
  }

  await publishGameEventToChannel("result", {
    gameName: "🚀 Ракета",
    gameId: "rocket",
    username: r.username,
    tgId: r.userId,
    bet: r.bet,
    mult: 0,
    payout: 0,
    isDemo: false,
    isDraw: false,
    isRefund: false,
  });
}

async function settleCashout(ctx, r, cashoutAt) {
  if (r.settled) return;
  r.settled = true;
  rounds.delete(r.userId);

  const win = Math.floor(r.bet * cashoutAt);

  await addWin(r.dbUserId, win);
  await createWinLedger(r.dbUserId, win, { game: "rocket", cashoutAt, bet: r.bet });

  try {
    if (r.chatId && r.messageId) {
      await editPhotoMessage(
        ctx,
        r.chatId,
        r.messageId,
        IMAGES.ROCKET,
        formatCashoutCaption(cashoutAt, r.bet, win),
        rocketMainKeyboard()
      );
    } else {
      await render(ctx, {
        photo: IMAGES.ROCKET,
        caption: formatCashoutCaption(cashoutAt, r.bet, win),
        keyboard: rocketMainKeyboard(),
        edit: true,
      });
    }
  } catch (_) {}

  await publishGameEventToChannel("result", {
    gameName: "🚀 Ракета",
    gameId: "rocket",
    username: r.username,
    tgId: r.userId,
    bet: r.bet,
    mult: cashoutAt,
    payout: win,
    isDemo: false,
    isDraw: false,
    isRefund: false,
  });
}

async function runRoundLoop(ctx, r) {
  while (true) {
    if (r.stopped) return;
    if (!rounds.has(r.userId)) return;
    if (r.settled) return;

    const raw = calcRawMultiplier(r.startedAt);

    if (raw >= r.crashAt) {
      return settleExplode(ctx, r);
    }

    const now = Date.now();
    const displayMult = floorToPrecision(raw, PRECISION);

    if (displayMult !== r.lastRenderedMult && now - r.lastUiEditAt >= UI_EDIT_MS) {
      r.mult = displayMult;
      r.lastRenderedMult = displayMult;
      r.lastUiEditAt = now;

      try {
        if (r.chatId && r.messageId) {
          await editPhotoMessage(
            ctx,
            r.chatId,
            r.messageId,
            IMAGES.ROCKET,
            formatRoundCaption(r.mult, r.bet),
            rocketRoundKeyboard()
          );
        } else {
          await render(ctx, {
            photo: IMAGES.ROCKET,
            caption: formatRoundCaption(r.mult, r.bet),
            keyboard: rocketRoundKeyboard(),
            edit: true,
          });
        }
      } catch (_) {}
    }

    await new Promise((res) => setTimeout(res, LOOP_TICK_MS));
  }
}

function normalizeBetAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function startRound(ctx, bet) {
  const userId = ctx.from.id;

  const normalizedBet = normalizeBetAmount(bet);
  if (!normalizedBet) {
    return ctx.reply(MESSAGES.INVALID_AMOUNT);
  }

  await stopRound(userId);

  const placed = await placeBet(ctx, normalizedBet, {
    gameId: "rocket",
    backKb: rocketMainKeyboard,
    meta: { game: "rocket" },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId } = placed;

  const crashAt = generateCrashMultiplier({ houseEdge: HOUSE_EDGE });

  const round = {
    userId,
    bet: normalizedBet,
    crashAt,
    startedAt: Date.now(),
    mult: 1.0,
    dbUserId,
    username: user?.username,
    lastRenderedMult: 1.0,
    lastUiEditAt: 0,
    settled: false,
    stopped: false,
    chatId: null,
    messageId: null,
  };

  rounds.set(userId, round);

  const cbMsg = ctx.callbackQuery?.message;

  if (cbMsg?.chat?.id && cbMsg?.message_id) {
    round.chatId = cbMsg.chat.id;
    round.messageId = cbMsg.message_id;
    try {
      await editPhotoMessage(
        ctx,
        round.chatId,
        round.messageId,
        IMAGES.ROCKET,
        formatRoundCaption(1.0, normalizedBet),
        rocketRoundKeyboard()
      );
    } catch (_) {
      try {
        const msg = await sendPhotoMessage(
          ctx,
          IMAGES.ROCKET,
          formatRoundCaption(1.0, normalizedBet),
          rocketRoundKeyboard()
        );
        round.chatId = msg.chat.id;
        round.messageId = msg.message_id;
      } catch (_) {}
    }
  } else {
    try {
      const msg = await sendPhotoMessage(
        ctx,
        IMAGES.ROCKET,
        formatRoundCaption(1.0, normalizedBet),
        rocketRoundKeyboard()
      );
      round.chatId = msg.chat.id;
      round.messageId = msg.message_id;
    } catch (_) {}
  }

  runRoundLoop(ctx, round).catch(() => {
    rounds.delete(userId);
  });
}

module.exports = {
  id: "rocket",

  async open(ctx) {
    await render(ctx, {
      photo: IMAGES.ROCKET,
      caption: formatRules(),
      keyboard: rocketMainKeyboard(),
      edit: true,
    });
  },

  async showBets(ctx) {
    await render(ctx, {
      photo: IMAGES.BET,
      caption: formatBetCaption(),
      keyboard: betsKeyboard("rocket"),
      edit: true,
    });
  },

  async onCallback(ctx, action) {
    const userId = ctx.from.id;

    try {
      await ctx.answerCallbackQuery();
    } catch (_) {}

    if (action === "play") return this.showBets(ctx);
    if (action === "back") return this.open(ctx);

    if (action === "stop") {
      await stopRound(userId);
      return this.open(ctx);
    }

    if (action === "cashout") {
      const r = rounds.get(userId);
      if (!r || r.settled || r.stopped) return;

      const rawNow = calcRawMultiplier(r.startedAt);

      if (rawNow >= r.crashAt) {
        return settleExplode(ctx, r);
      }

      const cashoutAt = floorToPrecision(rawNow, PRECISION);
      return settleCashout(ctx, r, cashoutAt);
    }

    if (action.startsWith("bet:")) {
      const v = action.split(":")[1];

      if (v === "custom") {
        session.setPending(ctx.from.id, { type: "rocket_custom_bet" });
        return ctx.reply("✏️ Введите сумму ставки в рублях:");
      }

      return startRound(ctx, v);
    }
  },

  async onText(ctx, pending) {
    if (pending?.type !== "rocket_custom_bet") return;

    const bet = normalizeBetAmount(String(ctx.message.text).trim());
    if (!bet) {
      session.setPending(ctx.from.id, { type: "rocket_custom_bet" });
      return ctx.reply("❌ Введите корректную сумму ставки:");
    }

    return startRound(ctx, bet);
  },
};
