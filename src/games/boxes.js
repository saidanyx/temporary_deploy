// src/games/boxes.js
const { InlineKeyboard } = require("grammy");
const crypto = require("crypto");
const IMAGES = require("../assets/images");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const { MESSAGES } = require("../ui/messages");
const { gameBackKeyboard } = require("../ui/common");
const session = require("../state/session");
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const { addWin, createWinLedger } = require("./checkingBalance");
const { DEFAULTS, placeBet } = require("./betEngine");

const tables = new Map(); // tgId -> { bet }

const PAY = {
  win: 2.9, // можно легко поменять под свою математику
};

const BET_COOLDOWN_MS = DEFAULTS.cooldownMs;

function normalizeBetAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function rulesText() {
  return (
    "📦 *КОРОБКИ* 📦\n\n" +
    "*Правила:*\n" +
    "Перед вами 3 коробки.\n" +
    "🎁 В одной — приз, в двух — пусто.\n\n" +
    "*Выплата:*\n" +
    `✅ Угадал → *x${PAY.win.toFixed(2)}*\n` +
    "❌ Не угадал → ставка сгорает\n\n" +
    "*Шанс победы: 1/3*"
  );
}

function mainKb() {
  return new InlineKeyboard()
    .text("🎮 Играть в боте", "boxes:play")
    .row()
    .text("⬅️ Назад", "nav:games");
}

function backKb() {
  return gameBackKeyboard("boxes");
}

function pickKb() {
  return new InlineKeyboard()
    .text("📦 1", "boxes:pick:1")
    .text("📦 2", "boxes:pick:2")
    .text("📦 3", "boxes:pick:3")
    .row()
    .text("⬅️ Назад", "boxes:bets");
}

function captionWithBet(title, bet) {
  return `${title}\n\nСтавка: *${bet} ₽*`;
}

function winningBox() {
  return crypto.randomInt(1, 4); // 1..3
}

async function showRules(ctx, edit = true) {
  await render(ctx, {
    photo: IMAGES.BOXES,
    caption: rulesText(),
    keyboard: mainKb(),
    edit,
  });
}

async function showBets(ctx) {
  await render(ctx, {
    photo: IMAGES.BET,
    caption: "💰 *Выберите ставку:*",
    keyboard: betsKeyboard("boxes"),
    edit: true,
  });
}

async function showPick(ctx, bet) {
  await render(ctx, {
    photo: IMAGES.BOXES,
    caption: captionWithBet("📦 *Коробки*\n\nВыберите коробку:", bet),
    keyboard: pickKb(),
    edit: true,
  });
}

async function resolve(ctx, bet, pick) {
  const placed = await placeBet(ctx, bet, {
    gameId: "boxes",
    backKb: backKb,
    meta: { game: "boxes", pick },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;
  const balanceReal = balanceRubles;

  const winBox = winningBox();
  const win = Number(pick) === winBox;

  if (win) {
    const won = Math.floor(bet * PAY.win);
    await addWin(dbUserId, won);
    await createWinLedger(dbUserId, won, { game: "boxes", pick: Number(pick), winBox });

    await ctx.reply(
      `🎉 *Угадал!*\nТвоя коробка: *${pick}*\nПриз был в: *${winBox}*\nВыигрыш: *${won} ₽* ✅`,
      { parse_mode: "Markdown", reply_markup: backKb() }
    );

    const newBalance = balanceReal - bet + won;
    await publishGameEventToChannel("result", {
      gameName: "📦 Коробки",
      gameId: "boxes",
      username: user.username,
      tgId: ctx.from.id,
      bet,
      resultSummary: `Выбор ${pick}, приз в ${winBox}`,
      mult: PAY.win,
      payout: won,
      newBalance,
      isDemo: false,
      isDraw: false,
      isRefund: false,
    });
  } else {
    await ctx.reply(
      `😢 *Не угадал*\nТвоя коробка: *${pick}*\nПриз был в: *${winBox}*`,
      { parse_mode: "Markdown", reply_markup: backKb() }
    );

    try {
      await calculateReferralBonus(dbUserId, bet);
    } catch (e) {
      console.error("Referral bonus error:", e);
    }

    const newBalance = balanceReal - bet;
    await publishGameEventToChannel("result", {
      gameName: "📦 Коробки",
      gameId: "boxes",
      username: user.username,
      tgId: ctx.from.id,
      bet,
      resultSummary: `Выбор ${pick}, приз в ${winBox}`,
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
  id: "boxes",

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
        session.setPending(tgId, { type: "boxes_custom_bet" });
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
      const pick = action.split(":")[1];
      if (!["1", "2", "3"].includes(pick)) return;
      await resolve(ctx, st.bet, pick);
      return showPick(ctx, st.bet);
    }
  },

  async onText(ctx, pending) {
    const tgId = ctx.from.id;

    if (pending.type === "boxes_custom_bet") {
      const bet = normalizeBetAmount(String(ctx.message.text).trim());
      if (!bet) {
        session.setPending(tgId, { type: "boxes_custom_bet" });
        return ctx.reply("❌ Введите корректную сумму ставки:");
      }
      tables.set(tgId, { bet });
      return showPick(ctx, bet);
    }
  },
};
