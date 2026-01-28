const { InlineKeyboard } = require("grammy");
const crypto = require("crypto");
const IMAGES = require("../assets/images");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const session = require("../state/session");
const { MESSAGES } = require("../ui/messages");
const { getOrCreateUser } = require("../services/users");
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const {
  deductBetWithLedgerAtomic,
  addWin,
  createRefundLedger,
  createWinLedger,
} = require("./checkingBalance");
const { DEFAULTS, placeBet } = require("./betEngine");



// userId -> state
const tables = new Map();

const BET_COOLDOWN_MS = DEFAULTS.cooldownMs;


// колода: 52 карты, значения по правилам
function newDeck() {
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const suits = ["♠","♥","♦","♣"];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push(`${r}${s}`);
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValueRank(card) {
  const r = card.slice(0, -1);
  if (r === "A") return 11;
  if (r === "K" || r === "Q" || r === "J") return 10;
  return Number(r);
}

function handScore(hand) {
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    const r = c.slice(0, -1);
    if (r === "A") aces += 1;
    sum += cardValueRank(c);
  }
  // A может быть 1 вместо 11
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces -= 1;
  }
  return sum;
}

function isBlackjack(hand) {
  return hand.length === 2 && handScore(hand) === 21;
}

function rulesText() {
  return (
    "🃏 *BLACKJACK* 🃏\n\n" +
    "*Цель игры:*\n" +
    "Набрать больше очков чем дилер, но не больше 21\n\n" +
    "*Правила:*\n" +
    "• Туз = 1 или 11 очков\n" +
    "• Картинки (J, Q, K) = 10 очков\n" +
    "• Остальные карты = номинал\n\n" +
    "*Действия:*\n" +
    "✅ Взять - взять еще карту\n" +
    "✋ Хватит - остановиться\n" +
    "💰 Удвоить - удвоить ставку и взять 1 карту\n" +
    "🏳 Сдаться - вернуть половину ставки\n\n" +
    "*Выплаты:*\n" +
    "• Блэкджек (21 из 2 карт) → x2.5\n" +
    "• Победа → x2\n" +
    "• Ничья → возврат ставки"
  );
}

function mainKb() {
  return new InlineKeyboard()
    .text("🎮 Играть в боте", "blackjack:play")
    .row()
    .text("⬅️ Назад", "nav:games");
}

function actionKb(state) {
  const kb = new InlineKeyboard()
    .text("✅ Взять", "blackjack:hit")
    .text("✋ Хватит", "blackjack:stand")
    .row()
    .text("💰 Удвоить", "blackjack:double")
    .text("🏳 Сдаться", "blackjack:surrender")
    .row()
    .text("🛑 Стоп", "blackjack:stop");
  return kb;
}

function tableCaption(st, { revealDealer = false } = {}) {
  const pScore = handScore(st.player);
  const dScore = revealDealer ? handScore(st.dealer) : "??";

  const dealerHand = revealDealer
    ? st.dealer.join(" ")
    : `${st.dealer[0]} ❓`;

  return (
    "🃏 *BLACKJACK* 🃏\n\n" +
    `Ставка: *${st.bet} ₽*\n\n` +
    `Дилер: ${dealerHand}\n` +
    `Очки дилера: *${dScore}*\n\n` +
    `Вы: ${st.player.join(" ")}\n` +
    `Ваши очки: *${pScore}*\n`
  );
}

async function showRules(ctx, edit = true) {
  await render(ctx, {
    photo: IMAGES.BLACKJACK,
    caption: rulesText(),
    keyboard: mainKb(),
    edit,
  });
}

async function showBets(ctx) {
  await render(ctx, {
    photo: IMAGES.BET,
    caption: "💰 *Выберите ставку:*",
    keyboard: betsKeyboard("blackjack"),
    edit: true,
  });
}

async function startHand(ctx, bet) {
  const userId = ctx.from.id;

  // Check if user already has an active game
  if (tables.has(userId)) {
    return ctx.reply("У вас уже есть активная игра. Завершите её перед началом новой.");
  }

  // Validate bet + cooldown, then atomic deduct + BET ledger
  const placed = await placeBet(ctx, bet, {
    gameId: "blackjack",
    backKb: () => mainKb(),
    meta: { game: "blackjack" },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles, bet: betAmount } = placed;

  const deck = newDeck();
  const st = {
    bet: betAmount,
    deck,
    player: [deck.pop(), deck.pop()],
    dealer: [deck.pop(), deck.pop()],
    finished: false,

    dbUserId,
    username: user?.username,
    balanceRubles,
  };
  tables.set(userId, st);

  // мгновенный исход: blackjack у игрока
  if (isBlackjack(st.player)) {
    const dealerBJ = isBlackjack(st.dealer);
    tables.delete(userId);

    if (dealerBJ) {
      // Return bet on tie
      await addWin(dbUserId, st.bet);
      await createRefundLedger(dbUserId, st.bet, { game: "blackjack", result: "tie_blackjack" });

      await publishGameEventToChannel("result", {
        gameName: "🃏 Блэкджек",
        gameId: "blackjack",
        username: user?.username,
        tgId: ctx.from.id,
        bet: st.bet,
        payout: 0,
        isDraw: true,
        isRefund: true,
      });
      await render(ctx, {
        photo: IMAGES.BLACKJACK,
        caption: tableCaption(st, { revealDealer: true }) + "\n\n🤝 *Ничья* — возврат ставки",
        keyboard: mainKb(),
        edit: true,
      });
      return;
    }

    const win = Math.floor(st.bet * 2.5);
    await addWin(dbUserId, win);
    await createWinLedger(dbUserId, win, { game: "blackjack", result: "blackjack" });

    await publishGameEventToChannel("result", {
      gameName: "🃏 Блэкджек",
      gameId: "blackjack",
      username: user?.username,
      tgId: ctx.from.id,
      bet: st.bet,
      mult: 2.5,
      payout: win,
      isDraw: false,
      isRefund: false,
    });
    await render(ctx, {
      photo: IMAGES.BLACKJACK,
      caption: tableCaption(st, { revealDealer: true }) + `\n\n🎉 *БЛЭКДЖЕК!* Выигрыш: *${win} ₽*`,
      keyboard: mainKb(),
      edit: true,
    });
    return;
  }

  await render(ctx, {
    photo: IMAGES.BLACKJACK,
    caption: tableCaption(st, { revealDealer: false }) + "\n\nВыберите действие:",
    keyboard: actionKb(st),
    edit: true,
  });
}

function dealerPlay(st) {
  while (handScore(st.dealer) < 17) {
    st.dealer.push(st.deck.pop());
  }
}

async function finish(ctx, st, { outcomeText, result, payout = 0, mult = 0, isDraw = false, isRefund = false, refundAmount = null }) {
  const userId = ctx.from.id;

  // settle balance/ledger once per hand
  if (!st.__settled) {
    st.__settled = true;

    if (isDraw) {
      // Full refund of current bet
      await addWin(st.dbUserId, st.bet);
      await createRefundLedger(st.dbUserId, st.bet, { game: "blackjack", result: result || "draw" });
    } else if (isRefund) {
      const ra = Number(refundAmount);
      const amount = Number.isFinite(ra) ? ra : st.bet;
      await addWin(st.dbUserId, amount);
      await createRefundLedger(st.dbUserId, amount, { game: "blackjack", result: result || "refund" });
    } else if (payout > 0) {
      await addWin(st.dbUserId, payout);
      await createWinLedger(st.dbUserId, payout, { game: "blackjack", result: result || "win", mult, bet: st.bet });
    } else {
      // Loss: referral bonus only for losses
      try {
        await calculateReferralBonus(st.dbUserId, st.bet);
      } catch (e) {
        console.error("Referral bonus error:", e);
      }
    }

    await publishGameEventToChannel("result", {
      gameName: "🃏 Блэкджек",
      gameId: "blackjack",
      username: st.username,
      tgId: userId,
      bet: st.bet,
      mult,
      payout,
      isDraw,
      isRefund,
      refundAmount,
      isDemo: false,
    });
  }

  tables.delete(userId);
  await render(ctx, {
    photo: IMAGES.BLACKJACK,
    caption: tableCaption(st, { revealDealer: true }) + "\n\n" + outcomeText,
    keyboard: mainKb(),
    edit: true,
  });
}

module.exports = {
  id: "blackjack",

  async open(ctx) {
    return showRules(ctx, true);
  },

  async onCallback(ctx, action) {
    const userId = ctx.from.id;
    const user = await getOrCreateUser(userId);

    if (action === "play") return showBets(ctx);
    if (action === "open") return showRules(ctx, true); // ✅ ВОТ ЭТО
    if (action === "back") return showRules(ctx, true);


    if (action === "stop") {
      tables.delete(userId);
      return showRules(ctx, true);
    }

    // ставки
    if (action.startsWith("bet:")) {
      const v = action.split(":")[1];
      if (v === "custom") {
        session.setPending(userId, { type: "blackjack_custom_bet" });
        return ctx.reply("✏️ Введите сумму ставки в рублях:");
      }
      const bet = Number(v);
      if (!bet || bet <= 0) return ctx.reply("❌ Некорректная сумма");
      return startHand(ctx, bet);
    }

    const st = tables.get(userId);
    if (!st || st.finished) return;

    if (action === "hit") {
      st.player.push(st.deck.pop());
      const p = handScore(st.player);

      if (p > 21) {
        return finish(ctx, st, { outcomeText: "💥 *Перебор!* Вы проиграли 😢", result: "bust", payout: 0, mult: 0 });
      }

      return render(ctx, {
        photo: IMAGES.BLACKJACK,
        caption: tableCaption(st, { revealDealer: false }) + "\n\nВыберите действие:",
        keyboard: actionKb(st),
        edit: true,
      });
    }

    if (action === "double") {
      // удвоить ставку и взять 1 карту, затем stand
      const originalBet = st.bet;
      st.bet *= 2;

      // Deduct additional bet for double (only the difference) atomically
      const extra = st.bet - originalBet;
      const res = await deductBetWithLedgerAtomic(st.dbUserId, extra, { game: "blackjack", action: "double_extra" });
      if (!res.ok) {
        st.bet = originalBet;
        await ctx.reply(MESSAGES.INSUFFICIENT_BALANCE, { reply_markup: actionKb(st) });
        return;
      }

      st.player.push(st.deck.pop());
      const p = handScore(st.player);

      if (p > 21) {
        return finish(ctx, st, { outcomeText: "💥 *Перебор на удвоении!* Вы проиграли 😢", result: "double_bust", payout: 0, mult: 0 });
      }

      dealerPlay(st);
      const d = handScore(st.dealer);

      if (d > 21 || p > d) {
        const win = Math.floor(st.bet * 2);
        return finish(ctx, st, { outcomeText: `🎉 *Победа!* Выигрыш: *${win} ₽*`, result: "double_win", payout: win, mult: 2 });
      }
      if (p === d) {
        // Full refund on tie
        return finish(ctx, st, { outcomeText: "🤝 *Ничья* — возврат ставки", result: "double_tie", payout: 0, mult: 0, isDraw: true });
      }
      return finish(ctx, st, { outcomeText: "😢 *Поражение*", result: "double_loss", payout: 0, mult: 0 });
    }

    if (action === "surrender") {
      // вернуть половину
      const refund = Math.floor(st.bet / 2);
      return finish(ctx, st, { outcomeText: `🏳 *Сдача* — возврат *${refund} ₽*`, result: "surrender", payout: 0, mult: 0, isRefund: true, refundAmount: refund });
    }

    if (action === "stand") {
      dealerPlay(st);
      const p = handScore(st.player);
      const d = handScore(st.dealer);

      // дилер blackjack?
      if (isBlackjack(st.dealer)) {
        return finish(ctx, st, { outcomeText: "😢 У дилера *Blackjack*", result: "dealer_blackjack", payout: 0, mult: 0 });
      }

      if (d > 21 || p > d) {
        const win = Math.floor(st.bet * 2);
        return finish(ctx, st, { outcomeText: `🎉 *Победа!* Выигрыш: *${win} ₽*`, result: "win", payout: win, mult: 2 });
      }
      if (p === d) {
        return finish(ctx, st, { outcomeText: "🤝 *Ничья* — возврат ставки", result: "draw", payout: 0, mult: 0, isDraw: true });
      }
      return finish(ctx, st, { outcomeText: "😢 *Поражение*", result: "loss", payout: 0, mult: 0 });
    }
  },

  async onText(ctx, pending) {
    if (pending.type !== "blackjack_custom_bet") return;
    const bet = Number(String(ctx.message.text).trim());
    if (!bet || bet <= 0) {
      session.setPending(ctx.from.id, { type: "blackjack_custom_bet" });
      return ctx.reply("❌ Введите корректную сумму ставки в рублях:");
    }
    return startHand(ctx, bet);
  },
};
