// src/games/wheel.js
const { InlineKeyboard } = require("grammy");
const crypto = require("crypto");
const IMAGES = require("../assets/images");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const { MESSAGES } = require("../ui/messages");
const { playInBotKeyboard, gameBackKeyboard, insufficientFunds } = require("../ui/common");
const session = require("../state/session");
const { getOrCreateUser } = require("../services/users");
const { updateBalance } = require("../services/wallets");
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const { addWin, createWinLedger } = require("./checkingBalance");
const { DEFAULTS, placeBet } = require("./betEngine");

const tables = new Map(); // tgId -> { bet }

const PAY = {
  redBlack: 1.7,
  green: 14,
};

const BET_COOLDOWN_MS = DEFAULTS.cooldownMs;

function normalizeBetAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

// Roulette-like distribution: 37 slots (18 red, 18 black, 1 green)
function spin() {
  const n = crypto.randomInt(1, 38); // 1..37
  if (n === 37) return "green";
  if (n <= 18) return "red";
  return "black";
}

function prettyColor(c) {
  if (c === "red") return "🔴 Красное";
  if (c === "black") return "⚫ Чёрное";
  return "🟢 Зелёное";
}

function rulesText() {
  return (
    "🎡 *КОЛЕСО ФОРТУНЫ* 🎡\n\n" +
    "*Выберите цвет:*\n" +
    "🔴 Красное / ⚫ Чёрное / 🟢 Зелёное\n\n" +
    "*Выплаты:*\n" +
    `🔴/⚫ → *x${PAY.redBlack.toFixed(2)}*\n` +
    `🟢 → *x${PAY.green}*\n\n` +
    "*Результат честный — случайное вращение.*"
  );
}

function mainKb() {
  return playInBotKeyboard("wheel:play")
  .row()
  .text("⬅️ Назад", "nav:games");
}



function pickKb() {
  return new InlineKeyboard()
    .text("🔴 Красное", "wheel:pick:red")
    .text("⚫ Чёрное", "wheel:pick:black")
    .row()
    .text("🟢 Зелёное", "wheel:pick:green")
    .row()
    .text("⬅️ Назад", "wheel:bets");
}

function captionWithBet(title, bet) {
  return `${title}\n\nСтавка: *${bet} ₽*`;
}

async function showRules(ctx, edit = true) {
  await render(ctx, {
    photo: IMAGES.WHEEL,
    caption: rulesText(),
    keyboard: mainKb(),
    edit,
  });
}

async function showBets(ctx) {
  await render(ctx, {
    photo: IMAGES.BET,
    caption: "💰 *Выберите ставку:*",
    keyboard: betsKeyboard("wheel"),
    edit: true,
  });
}

async function showPick(ctx, bet) {
  await render(ctx, {
    photo: IMAGES.WHEEL,
    caption: captionWithBet("🎡 *Колесо фортуны*\n\nВыберите цвет:", bet),
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
    await insufficientFunds(ctx, gameBackKeyboard("wheel"));
    return false;
  }
  return true;
}

async function createBetLedger(dbUserId, bet, meta) {
  await prisma.ledger.create({
    data: { user_id: dbUserId, type: "BET", amount: bet, meta },
  });
}

async function resolve(ctx, bet, pick) {
  const placed = await placeBet(ctx, bet, {
    gameId: "wheel",
    backKb: gameBackKeyboard("wheel"),
    meta: { game: "wheel", pick },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;
  const balanceReal = balanceRubles;

  const spinResult = spin();
  const win = spinResult === pick;

  if (win) {
    const mult = pick === "green" ? PAY.green : PAY.redBlack;
    const won = Math.floor(bet * mult);

    await addWin(dbUserId, won);
    await createWinLedger(dbUserId, won, { game: "wheel", pick, result: spinResult, mult });

    await ctx.reply(
      `✅ *Победа!*\nВыбор: *${prettyColor(pick)}*\nВыпало: *${prettyColor(spinResult)}*\nВыигрыш: *${won} ₽* 🎉`,
      { parse_mode: "Markdown", reply_markup: gameBackKeyboard("wheel") }
    );

    const newBalance = balanceReal - bet + won;
    await publishGameEventToChannel("result", {
      gameName: "🎡 Колесо Фортуны",
      gameId: "wheel",
      username: user.username,
      tgId: ctx.from.id,
      bet,
      resultSummary: `${prettyColor(pick)} vs ${prettyColor(spinResult)}`,
      mult,
      payout: won,
      newBalance,
      isDemo: false,
      isDraw: false,
      isRefund: false,
    });
  } else {
    await ctx.reply(
      `😢 *Проигрыш*\nВыбор: *${prettyColor(pick)}*\nВыпало: *${prettyColor(spinResult)}*`,
      { parse_mode: "Markdown", reply_markup: gameBackKeyboard("wheel") }
    );

// Referral bonus: only for losses
try {
  await calculateReferralBonus(dbUserId, bet);
} catch (e) {
  console.error("Referral bonus error:", e);
}
    const newBalance = balanceReal - bet;
    await publishGameEventToChannel("result", {
      gameName: "🎡 Колесо Фортуны",
      gameId: "wheel",
      username: user.username,
      tgId: ctx.from.id,
      bet,
      resultSummary: `${prettyColor(pick)} vs ${prettyColor(spinResult)}`,
      mult: 0,
      payout: 0,
      newBalance,
      isDemo: false,
      isDraw: false,
      isRefund: false,
    });
  }
}

module.exports = {
  id: "wheel",

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
        session.setPending(tgId, { type: "wheel_custom_bet" });
        return ctx.reply(MESSAGES.ENTER_BET_AMOUNT);
      }
      const bet = Number(v);
      if (!bet || bet <= 0) return ctx.reply(MESSAGES.INVALID_AMOUNT);
      tables.set(tgId, { bet });
      return showPick(ctx, bet);
    }

    const st = tables.get(tgId);
    if (!st?.bet) return showBets(ctx);

    if (action.startsWith("pick:")) {
      const pick = action.split(":")[1];
      if (!["red", "black", "green"].includes(pick)) return;
      await resolve(ctx, st.bet, pick);
      return showPick(ctx, st.bet);
    }
  },

  async onText(ctx, pending) {
    const tgId = ctx.from.id;

    if (pending.type === "wheel_custom_bet") {
      const bet = Number(String(ctx.message.text).trim());
      if (!bet || bet <= 0) {
        session.setPending(tgId, { type: "wheel_custom_bet" });
        return ctx.reply(MESSAGES.ENTER_CORRECT_BET_AMOUNT);
      }
      tables.set(tgId, { bet });
      return showPick(ctx, bet);
    }
  },
};
