// src/games/diceMiniBase.js
// A reusable engine for simple Telegram Dice-based mini-games (🎳🏀🎯🎰⚽ etc.)
const { InlineKeyboard } = require("grammy");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const session = require("../state/session");
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const { addWin, createWinLedger } = require("./checkingBalance");
const { DEFAULTS, placeBet } = require("./betEngine");
const IMAGES = require("../assets/images");

function mainKb(gameId) {
  return new InlineKeyboard()
    .text("🎮 Играть в боте", `play:${gameId}`)
    .row()
    .text("⬅️ Назад", "nav:games");
}

function backKb(gameId) {
  return new InlineKeyboard().text("⬅️ Назад", "game:" + gameId);
}

function fmt2(n) {
  return (Math.floor(n * 100) / 100).toFixed(2);
}

function buildDiceMiniGame({
  id,
  gameName,
  gameId,
  photo,
  emoji,
  rulesText,
  payoutFn,
  // optional extras
  minBet = undefined,
  maxBet = undefined,
  betCooldownMs = DEFAULTS.cooldownMs,
  resultSummaryFn,
  onBeforeRoll, // optional hook: async ({ ctx, bet, user, dbUserId }) => void
}) {

  async function open(ctx) {
    await render(ctx, {
      photo,
      caption: rulesText,
      keyboard: mainKb(id),
      edit: true,
    });
  }

  async function showBets(ctx) {
    await render(ctx, {
      photo: IMAGES.BET,
      caption: "💰 *Выберите ставку:*",
      keyboard: betsKeyboard(id),
      edit: true,
    });
  }

  async function playRound(ctx, bet) {
    // Validate (global admin limits by default), cooldown, then atomic deduct + BET ledger
    const placed = await placeBet(ctx, bet, {
      gameId: id,
      backKb: () => backKb(id),
      meta: { game: id },
      minBet,
      maxBet,
      cooldownMs: betCooldownMs,
    });
    if (!placed) return;
    const { user, dbUserId, balanceRubles, bet: betAmount } = placed;

    if (typeof onBeforeRoll === "function") {
      try {
        await onBeforeRoll({ ctx, bet: betAmount, user, dbUserId });
      } catch (e) {
        console.error(`[${id}] onBeforeRoll error:`, e);
      }
    }

    // Бросок кубика
    const msg = await ctx.replyWithDice(emoji);
    const value = msg.dice.value;

    // Коэффициент
    const k = payoutFn(value);

    if (k > 0) {
      const win = Math.floor(betAmount * k);

      // Начисляем выигрыш
      await addWin(dbUserId, win);
      await createWinLedger(dbUserId, win, { game: id, dice: value, mult: k });

      await ctx.reply(
        `✅ *Победа!*\nВыпало: *${value}*\nКоэф: *x${fmt2(k)}*\nВыигрыш: *${win} ₽* 🎉`,
        { parse_mode: "Markdown", reply_markup: backKb(id) }
      );

      const newBalance = balanceRubles - betAmount + win;
      await publishGameEventToChannel("result", {
        gameName,
        gameId,
        username: user.username,
        tgId: ctx.from.id,
        bet: betAmount,
        resultSummary:
          typeof resultSummaryFn === "function" ? resultSummaryFn(value) : `${emoji} ${value}`,
        mult: k,
        payout: win,
        newBalance,
        isDemo: false,
        isDraw: false,
        isRefund: false,
      });
    } else {
      await ctx.reply(`😢 *Проигрыш*\nВыпало: *${value}*`, {
        parse_mode: "Markdown",
        reply_markup: backKb(id),
      });

      // Calculate referral bonus on loss
      try {
        await calculateReferralBonus(dbUserId, betAmount);
      } catch (e) {
        console.error("Referral bonus error:", e);
      }
      const newBalance = balanceRubles - betAmount;
      await publishGameEventToChannel("result", {
        gameName,
        gameId,
        username: user.username,
        tgId: ctx.from.id,
        bet: betAmount,
        resultSummary:
          typeof resultSummaryFn === "function" ? resultSummaryFn(value) : `${emoji} ${value}`,
        mult: 0,
        payout: 0,
        newBalance,
        isDemo: false,
        isDraw: false,
        isRefund: false,
      });
    }

    return open(ctx);
  }

  async function onCallback(ctx, action) {
    if (action === "play") return showBets(ctx);
    if (action === "back") return open(ctx);

    if (action.startsWith("bet:")) {
      const v = action.split(":")[1];

      if (v === "custom") {
        session.setPending(ctx.from.id, { type: `${id}_custom_bet` });
        return ctx.reply("✏️ Введите сумму ставки в рублях:");
      }

      const bet = Number(v);
      if (!bet || bet <= 0) return ctx.reply("❌ Некорректная сумма");
      return playRound(ctx, bet);
    }
  }

  async function onText(ctx, pending) {
    if (pending.type !== `${id}_custom_bet`) return;

    const bet = Number(String(ctx.message.text).trim());
    if (!bet || bet <= 0) {
      session.setPending(ctx.from.id, { type: `${id}_custom_bet` });
      return ctx.reply("❌ Введите корректную сумму ставки в рублях:");
    }

    return playRound(ctx, bet);
  }

  return { id, open, showBets, onCallback, onText };
}

module.exports = { buildDiceMiniGame };
