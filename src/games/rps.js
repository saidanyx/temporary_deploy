// src/games/rps.js
const { InlineKeyboard } = require("grammy");
const crypto = require("crypto");
const IMAGES = require("../assets/images");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const session = require("../state/session");
const { MESSAGES } = require("../ui/messages");
const { insufficientFunds, playInBotKeyboard, gameBackKeyboard } = require("../ui/common");
const { getOrCreateUser } = require("../services/users");
const { updateBalance } = require("../services/wallets");
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const { addWin, createWinLedger, createRefundLedger } = require("./checkingBalance");
const { DEFAULTS, placeBet } = require("./betEngine");

const tables = new Map(); // tgId -> { bet }

const PAY = {
  win: 2.5,
  drawFee: 0.07, // 7% комиссия при ничьей
};

const BET_COOLDOWN_MS = DEFAULTS.cooldownMs;

function normalizeBetAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function rulesText() {
  return (
    "🪨✂️📄 *Камень-Ножницы-Бумага* 🪨✂️📄\n\n" +
    "*Правила:*\n" +
    "Выберите ход, бот выберет ответ.\n\n" +
    "*Исходы:*\n" +
    `✅ Победа → *x${PAY.win.toFixed(2)}*\n` +
    `🤝 Ничья → возврат ставки − *${Math.round(PAY.drawFee * 100)}%*\n` +
    "❌ Поражение → ставка сгорает\n\n" +
    "*Результат честный — случайный выбор бота.*"
  );
}

function mainKb() {
  return playInBotKeyboard("rps:play").row().text("⬅️ Назад", "nav:games");
}

function backKb() {
  return gameBackKeyboard("rps");
}

function pickKb() {
  return new InlineKeyboard()
    .text("🪨 Камень", "rps:pick:rock")
    .row()
    .text("✂️ Ножницы", "rps:pick:scissors")
    .row()
    .text("📄 Бумага", "rps:pick:paper")
    .row()
    .text("⬅️ Назад", "rps:bets");
}

function captionWithBet(title, bet) {
  return `${title}\n\nСтавка: *${bet} ₽*`;
}

function rndPick() {
  const arr = ["rock", "scissors", "paper"];
  return arr[crypto.randomInt(0, arr.length)];
}

function prettyPick(p) {
  if (p === "rock") return "🪨 Камень";
  if (p === "scissors") return "✂️ Ножницы";
  return "📄 Бумага";
}

function outcome(userPick, botPick) {
  if (userPick === botPick) return "draw";
  if (
    (userPick === "rock" && botPick === "scissors") ||
    (userPick === "scissors" && botPick === "paper") ||
    (userPick === "paper" && botPick === "rock")
  ) return "win";
  return "lose";
}

async function showRules(ctx, edit = true) {
  await render(ctx, {
    photo: IMAGES.RPS,
    caption: rulesText(),
    keyboard: mainKb(),
    edit,
  });
}

async function showBets(ctx) {
  await render(ctx, {
    photo: IMAGES.BET,
    caption: "💰 *Выберите ставку:*",
    keyboard: betsKeyboard("rps"),
    edit: true,
  });
}

async function showPick(ctx, bet) {
  await render(ctx, {
    photo: IMAGES.RPS,
    caption: captionWithBet("🪨✂️📄 *КНБ*\n\nВыберите ход:", bet),
    keyboard: pickKb(),
    edit: true,
  });
}

async function getDbUserAndBalance(ctx) {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const dbUserId = user.id;
  const balanceReal = Number(user.wallet?.balance_real ?? 0);
  return { user, dbUserId, balanceReal };
}

async function ensureEnough(ctx, balance, bet) {
  if (balance < bet) {
    await ctx.reply(MESSAGES.INSUFFICIENT_BALANCE, { reply_markup: backKb() });
    return false;
  }
  return true;
}

async function createBetLedger(dbUserId, bet, meta) {
  await prisma.ledger.create({
    data: { user_id: dbUserId, type: "BET", amount: bet, meta },
  });
}

async function resolve(ctx, bet, userPick) {
  const placed = await placeBet(ctx, bet, {
    gameId: "rps",
    backKb: backKb,
    meta: { game: "rps", pick: userPick },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;
  const balanceReal = balanceRubles;

  const botPick = rndPick();
  const res = outcome(userPick, botPick);

  if (res === "win") {
    const won = Math.floor(bet * PAY.win);
    await addWin(dbUserId, won);
    await createWinLedger(dbUserId, won, { game: "rps", pick: userPick, botPick, result: "win" });

    await ctx.reply(
      `✅ *Победа!*\nТвой ход: *${prettyPick(userPick)}*\nХод бота: *${prettyPick(botPick)}*\nВыигрыш: *${won} ₽* 🎉`,
      { parse_mode: "Markdown", reply_markup: backKb() }
    );

    const newBalance = balanceReal - bet + won;
    await publishGameEventToChannel("result", {
      gameName: "✂️ Камень! Ножницы! Бумага!",
      gameId: "rps",
      username: user.username,
      tgId: ctx.from.id,
      bet,
      resultSummary: `${prettyPick(userPick)} vs ${prettyPick(botPick)}`,
      mult: PAY.win,
      payout: won,
      newBalance,
      isDemo: false,
      isDraw: false,
      isRefund: false,
    });
    return;
  }

  if (res === "draw") {
    const fee = Math.floor(bet * PAY.drawFee);
    const refund = bet - fee;

    // возвращаем с комиссией
    if (refund > 0) await addWin(dbUserId, refund);
    await createRefundLedger(dbUserId, refund, { game: "rps", pick: userPick, botPick, result: "draw", fee });

    await ctx.reply(
      `🤝 *Ничья*\nТвой ход: *${prettyPick(userPick)}*\nХод бота: *${prettyPick(botPick)}*\nВозврат: *${refund} ₽* (комиссия ${fee} ₽)`,
      { parse_mode: "Markdown", reply_markup: backKb() }
    );
    return;
  }

  await ctx.reply(
    `😢 *Проигрыш*\nТвой ход: *${prettyPick(userPick)}*\nХод бота: *${prettyPick(botPick)}*`,
    { parse_mode: "Markdown", reply_markup: backKb() }
  );

// Referral bonus: only for losses
try {
  await calculateReferralBonus(dbUserId, bet);
} catch (e) {
  console.error("Referral bonus error:", e);
}
  const newBalance = balanceReal - bet;
  await publishGameEventToChannel("result", {
    gameName: "✂️ Камень! Ножницы! Бумага!",
    gameId: "rps",
    username: user.username,
    tgId: ctx.from.id,
    bet,
    resultSummary: `${prettyPick(userPick)} vs ${prettyPick(botPick)}`,
    mult: 0,
    payout: 0,
    newBalance,
    isDemo: false,
    isDraw: false,
    isRefund: false,
  });
}

module.exports = {
  id: "rps",

  async open(ctx) {
    tables.delete(ctx.from.id);
    return showRules(ctx, true);
  },

  async onCallback(ctx, action) {
    const tgId = ctx.from.id;

    if (action === "play") return showBets(ctx);
    if (action === "back") return showRules(ctx, true);

    if (action === "bets") return showBets(ctx);

    // ставки
    if (action.startsWith("bet:")) {
      const v = action.split(":")[1];
      if (v === "custom") {
        session.setPending(tgId, { type: "rps_custom_bet" });
        return ctx.reply("✏️ Введите сумму ставки в рублях:");
      }
      const bet = normalizeBetAmount(v);
      if (!bet) return ctx.reply(MESSAGES.INVALID_AMOUNT);
      tables.set(tgId, { bet });
      return showPick(ctx, bet);
    }

    const st = tables.get(tgId);
    if (!st?.bet) return showBets(ctx);

    if (action.startsWith("pick:")) {
      const userPick = action.split(":")[1];
      if (!["rock", "scissors", "paper"].includes(userPick)) return;
      await resolve(ctx, st.bet, userPick);
      return showPick(ctx, st.bet);
    }
  },

  async onText(ctx, pending) {
    const tgId = ctx.from.id;

    if (pending.type === "rps_custom_bet") {
      const bet = normalizeBetAmount(String(ctx.message.text).trim());
      if (!bet) {
        session.setPending(tgId, { type: "rps_custom_bet" });
        return ctx.reply("❌ Введите корректную сумму ставки в рублях:");
      }
      tables.set(tgId, { bet });
      return showPick(ctx, bet);
    }
  },
};
