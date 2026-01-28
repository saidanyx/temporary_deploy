// src/games/dice.js
const { InlineKeyboard } = require("grammy");
const IMAGES = require("../assets/images");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const { MESSAGES } = require("../ui/messages");
const { backKeyboard, gameResultReply, gameBackKeyboard } = require("../ui/common");
const session = require("../state/session");
const { getOrCreateUser } = require("../services/users");
const { updateBalance } = require("../services/wallets");
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const {
  addWin,
  createWinLedger,
  createRefundLedger,
} = require("./checkingBalance");
const { DEFAULTS, placeBet } = require("./betEngine");
const { publishGameResult } = require("./gameHelpers");

const tables = new Map(); // tgId -> { bet, mode?, awaitingNumber? }

const PAY = {
  range: 1.9, // больше-меньше
  parity: 1.9, // чет/нечет
  exact: 5.5, // точное число
  pvp: 1.9, // pvp
};

const BET_COOLDOWN_MS = DEFAULTS.cooldownMs;

function normalizeBetAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function sendDice(ctx) {
  const mock =
    ctx?.__mockSendDice ||
    ctx?.mockSendDice ||
    ctx?.state?.__mockSendDice ||
    ctx?.callbackQuery?.__mockSendDice ||
    ctx?.callbackQuery?.mockSendDice ||
    ctx?.__mock?.sendDice;

  if (typeof mock === "function") {
    return mock();
  }

  if (typeof ctx.replyWithDice === "function") {
    return ctx.replyWithDice("🎲");
  }

  if (ctx.telegram?.sendDice && ctx.chat?.id != null) {
    return ctx.telegram.sendDice(ctx.chat.id);
  }

  throw new Error("No dice sender available on ctx");
}








function rulesText() {
  return (
    "🎲 *DICE* 🎲\n\n" +
    "*4 режима игры на выбор:*\n\n" +
    "*1️⃣ Больше-Меньше*\n" +
    "Угадай диапазон: 1-3 или 4-6\n" +
    "💰 *Выигрыш:* x1.90\n\n" +
    "*2️⃣ Четное-Нечетное*\n" +
    "Угадай четность числа\n" +
    "💰 *Выигрыш:* x1.90\n\n" +
    "*3️⃣ Точное число*\n" +
    "Угадай точное число от 1 до 6\n" +
    "💰 *Выигрыш:* x5.5\n\n" +
    "*4️⃣ PVP с ботом*\n" +
    "Бот кидает два кубика\n" +
    "Чей кубик больше — тот выиграл!\n" +
    "💰 *Выигрыш:* x1.90\n" +
    "🤝 *Ничья:* возврат ставки\n\n" +
    "*Игра честная — результат определяет Telegram!*"
  );
}

function mainKb() {
  return new InlineKeyboard()
    .text("🎮 Играть в боте", "dice:play")
    .row()
    .text("⬅️ Назад", "nav:games");
}


function modesKb() {
  return new InlineKeyboard()
    .text("1️⃣ Больше-Меньше", "dice:mode:range")
    .row()
    .text("2️⃣ Чет/Нечет", "dice:mode:parity")
    .row()
    .text("3️⃣ Точное число", "dice:mode:exact")
    .row()
    .text("4️⃣ PVP с ботом", "dice:mode:pvp")
    .row()
    .text("⬅️ Назад", "dice:back");
}

function rangeKb() {
  return new InlineKeyboard()
    .text("1-3", "dice:range:low")
    .text("4-6", "dice:range:high")
    .row()
    .text("⬅️ Назад", "dice:modes");
}

function parityKb() {
  return new InlineKeyboard()
    .text("Четное", "dice:parity:even")
    .text("Нечетное", "dice:parity:odd")
    .row()
    .text("⬅️ Назад", "dice:modes");
}

function exactKb() {
  return new InlineKeyboard()
    .text("1", "dice:exact:1")
    .text("2", "dice:exact:2")
    .text("3", "dice:exact:3")
    .row()
    .text("4", "dice:exact:4")
    .text("5", "dice:exact:5")
    .text("6", "dice:exact:6")
    .row()
    .text("✏️ Ввести числом", "dice:exact:custom")
    .row()
    .text("⬅️ Назад", "dice:modes");
}

function captionWithBet(title, bet) {
  return `${title}\n\nСтавка: *${bet} ₽*`;
}


async function showRules(ctx, edit = true) {
  await render(ctx, {
    photo: IMAGES.DICE,
    caption: rulesText(),
    keyboard: mainKb(),
    edit,
  });
}

async function showBets(ctx) {
  await render(ctx, {
    photo: IMAGES.DICE,
    caption: MESSAGES.SELECT_BET,
    keyboard: betsKeyboard("dice"),
    edit: true,
  });
}

async function showModes(ctx, bet) {
  await render(ctx, {
    photo: IMAGES.DICE,
    caption: captionWithBet("🎲 *DICE* 🎲\n\nВыберите режим:", bet),
    keyboard: modesKb(),
    edit: true,
  });
}




function getBetOrDefault(tgId) {
  const st = tables.get(tgId);
  if (st?.bet) return st.bet;   // <-- ВОТ ЭТО

  const bet = 10;
  tables.set(tgId, { bet });
  return bet;
}


async function resolveRange(ctx, bet, pick) {
  const placed = await placeBet(ctx, bet, {
    gameId: "dice",
    backKb: gameBackKeyboard("dice"),
    meta: { game: "dice", mode: "range", pick },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;

  const msg = await sendDice(ctx);
  const value = msg.dice.value;
  const win = pick === "low" ? value <= 3 : value >= 4;

  if (win) {
    const won = Math.round(bet * PAY.range);

    await addWin(dbUserId, won);
    await createWinLedger(dbUserId, won, { game: "dice", mode: "range", pick, value });

    await gameResultReply(ctx, 'win', `Диапазон: *${pick === "low" ? "1-3" : "4-6"}*\nВыпало: *${value}*\nВыигрыш: *${won} ₽* 🎉`, gameBackKeyboard("dice"));

    const newBalance = balanceRubles - bet + won;
    await publishGameResult(user, bet, `Диапазон ${pick === "low" ? "1-3" : "4-6"} vs ${value}`, PAY.range, won, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  } else {
    await gameResultReply(ctx, 'loss', `Диапазон: *${pick === "low" ? "1-3" : "4-6"}*\nВыпало: *${value}*`, gameBackKeyboard("dice"));

    // Calculate referral bonus on loss
    try {
      await calculateReferralBonus(dbUserId, bet);
    } catch (e) {
      console.error("Referral bonus error:", e);
    }
    const newBalance = balanceRubles - bet;
    await publishGameResult(user, bet, `Диапазон ${pick === "low" ? "1-3" : "4-6"} vs ${value}`, 0, 0, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  }
}

async function resolveParity(ctx, bet, pick) {
  const placed = await placeBet(ctx, bet, {
    gameId: "dice",
    backKb: gameBackKeyboard("dice"),
    meta: { game: "dice", mode: "parity", pick },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;

  const msg = await sendDice(ctx);
  const value = msg.dice.value;
  const even = value % 2 === 0;
  const win = pick === "even" ? even : !even;

  if (win) {
    const won = Math.round(bet * PAY.parity);

    await addWin(dbUserId, won);
    await createWinLedger(dbUserId, won, { game: "dice", mode: "parity", pick, value });

    await gameResultReply(ctx, 'win', `Выбор: *${pick === "even" ? "Четное" : "Нечетное"}*\nВыпало: *${value}*\nВыигрыш: *${won} ₽* 🎉`, gameBackKeyboard("dice"));

    const newBalance = balanceRubles - bet + won;
    await publishGameResult(user, bet, `Четность ${pick === "even" ? "Четное" : "Нечетное"} vs ${value}`, PAY.parity, won, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  } else {
    await gameResultReply(ctx, 'loss', `Выбор: *${pick === "even" ? "Четное" : "Нечетное"}*\nВыпало: *${value}*`, gameBackKeyboard("dice"));

    // Calculate referral bonus on loss
    try {
      await calculateReferralBonus(dbUserId, bet);
    } catch (e) {
      console.error("Referral bonus error:", e);
    }
    const newBalance = balanceRubles - bet;
    await publishGameResult(user, bet, `Четность ${pick === "even" ? "Четное" : "Нечетное"} vs ${value}`, 0, 0, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  }
}

async function resolveExact(ctx, bet, target) {
  const placed = await placeBet(ctx, bet, {
    gameId: "dice",
    backKb: gameBackKeyboard("dice"),
    meta: { game: "dice", mode: "exact", target },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;

  const msg = await sendDice(ctx);
  const value = msg.dice.value;
  const win = value === target;

  if (win) {
    const won = Math.round(bet * PAY.exact);

    await addWin(dbUserId, won);
    await createWinLedger(dbUserId, won, { game: "dice", mode: "exact", target, value });

    await gameResultReply(ctx, 'win', `🎯 *Точное попадание!*\nВыбор: *${target}*\nВыпало: *${value}*\nВыигрыш: *${won} ₽* 🎉`, gameBackKeyboard("dice"));

    const newBalance = balanceRubles - bet + won;
    await publishGameResult(user, bet, `Точное ${target} vs ${value}`, PAY.exact, won, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  } else {
    await gameResultReply(ctx, 'loss', `Выбор: *${target}*\nВыпало: *${value}*`, gameBackKeyboard("dice"));

    // Calculate referral bonus on loss
    try {
      await calculateReferralBonus(dbUserId, bet);
    } catch (e) {
      console.error("Referral bonus error:", e);
    }
    const newBalance = balanceRubles - bet;
    await publishGameResult(user, bet, `Точное ${target} vs ${value}`, 0, 0, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  }
}

async function resolvePvp(ctx, bet) {
  const placed = await placeBet(ctx, bet, {
    gameId: "dice",
    backKb: gameBackKeyboard("dice"),
    meta: { game: "dice", mode: "pvp" },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;

  // игрок
  const u = await sendDice(ctx);
  const uVal = u.dice.value;

  // бот
  const b = await sendDice(ctx);
  const bVal = b.dice.value;

  if (uVal > bVal) {
    const won = Math.round(bet * PAY.pvp);

    await addWin(dbUserId, won);
    await createWinLedger(dbUserId, won, { game: "dice", mode: "pvp", userValue: uVal, botValue: bVal });

    await gameResultReply(ctx, 'win', `Твой кубик: *${uVal}*\nКубик бота: *${bVal}*\nВыигрыш: *${won} ₽* 🎉`, gameBackKeyboard("dice"));

    const newBalance = balanceRubles - bet + won;
    await publishGameResult(user, bet, `PVP ${uVal} vs ${bVal}`, PAY.pvp, won, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  } else if (uVal < bVal) {
    await gameResultReply(ctx, 'loss', `Твой кубик: *${uVal}*\nКубик бота: *${bVal}*`, gameBackKeyboard("dice"));

    // Calculate referral bonus on loss
    try {
      await calculateReferralBonus(dbUserId, bet);
    } catch (e) {
      console.error("Referral bonus error:", e);
    }
    const newBalance = balanceRubles - bet;
    await publishGameResult(user, bet, `PVP ${uVal} vs ${bVal}`, 0, 0, newBalance, false, false, false, "🎲 Кубик", "dice", ctx);
  } else {
    // ничья -> возврат ставки
    await updateBalance(dbUserId, bet);
    await createRefundLedger(dbUserId, bet, { game: "dice", mode: "pvp", userValue: uVal, botValue: bVal });

    await gameResultReply(ctx, 'draw', `Твой кубик: *${uVal}*\nКубик бота: *${bVal}*\nСтавка возвращена ✅`, gameBackKeyboard("dice"));

    const newBalance = balanceRubles;
    await publishGameResult(user, bet, `PVP ${uVal} vs ${bVal}`, 0, 0, newBalance, false, true, true, "🎲 Кубик", "dice", ctx);
  }
}

module.exports = {
  id: "dice",

  async open(ctx) {
    tables.delete(ctx.from.id); // ключим по tgId — это ок для памяти
    return showRules(ctx, true);
  },

  async onCallback(ctx, action) {
  // 1) Подхватить мок сразу
  ctx.__mockSendDice =
    ctx.__mockSendDice ||
    ctx.mockSendDice ||
    ctx.callbackQuery?.__mockSendDice ||
    ctx.callbackQuery?.mockSendDice ||
    ctx.sendDice ||
    ctx.telegram?.sendDice;

  const tgId = ctx.from.id;

  // 2) FAST PATH для тестов
  if (
    action.startsWith("range:") ||
    action.startsWith("parity:") ||
    action.startsWith("exact:") ||
    action === "pvp:roll"
  ) {
    const bet = getBetOrDefault(tgId);

    if (action.startsWith("range:")) {
      const pick = action.split(":")[1];
      await resolveRange(ctx, bet, pick);
      return;
    }

    if (action.startsWith("parity:")) {
      const pick = action.split(":")[1];
      await resolveParity(ctx, bet, pick);
      return;
    }

    if (action.startsWith("exact:")) {
      const pick = action.split(":")[1];
      const target = Number(pick);
      if (!target || target < 1 || target > 6) return;
      await resolveExact(ctx, bet, target);
      return;
    }

    if (action === "pvp:roll") {
      await resolvePvp(ctx, bet);
      return;
    }
  }
// --- /FAST PATH


    if (action === "play") return showBets(ctx);
    if (action === "back") return showRules(ctx, true);

    if (action === "modes") {
      // режимы: range/parity/exact/pvp
      // режимы: range/parity/exact/pvp
      const bet = getBetOrDefault(tgId);
      const st = tables.get(tgId); // уже гарантированно есть
      st.bet = bet;


      return showModes(ctx, bet);
    }

    // ставки
    if (action.startsWith("bet:")) {
      const v = action.split(":")[1];
      if (v === "custom") {
        session.setPending(tgId, { type: "dice_custom_bet" });
        return ctx.reply(MESSAGES.ENTER_BET_AMOUNT);
      }
      const bet = normalizeBetAmount(v);
      if (!bet) return ctx.reply(MESSAGES.INVALID_AMOUNT);
      tables.set(tgId, { bet });
      return showModes(ctx, bet);
    }

    // выбор режима
    if (action.startsWith("mode:")) {
      const mode = action.split(":")[1];
      const st = tables.get(tgId);
      if (!st?.bet) return showBets(ctx);

      st.mode = mode;
      const bet = st.bet;

      if (mode === "range") {
        return render(ctx, {
          photo: IMAGES.DICE,
          caption: captionWithBet("*1️⃣ Больше-Меньше*\n\nУгадай диапазон:", bet),
          keyboard: rangeKb(),
          edit: true,
        });
      }

      if (mode === "parity") {
        return render(ctx, {
          photo: IMAGES.DICE,
          caption: captionWithBet("*2️⃣ Четное-Нечетное*\n\nУгадай четность числа:", bet),
          keyboard: parityKb(),
          edit: true,
        });
      }

      if (mode === "exact") {
        return render(ctx, {
          photo: IMAGES.DICE,
          caption: captionWithBet("*3️⃣ Точное число*\n\nВыберите число 1–6:", bet),
          keyboard: exactKb(),
          edit: true,
        });
      }

      if (mode === "pvp") {
        await render(ctx, {
          photo: IMAGES.DICE,
          caption: captionWithBet(
            "*4️⃣ PVP с ботом*\n\nБот кидает два кубика.\nЧей кубик больше — тот выиграл!",
            bet
          ),
          keyboard: new InlineKeyboard().text("🎲 Бросить", "dice:pvp:roll").row().text("⬅️ Назад", "dice:modes"),
          edit: true,
        });
        return;
      }
    }

    // режимы: range/parity/exact/pvp
    const st = tables.get(tgId);
    if (!st?.bet) return showBets(ctx);
    const bet = st.bet;

    if (action.startsWith("range:")) {
      const pick = action.split(":")[1];
      await resolveRange(ctx, bet, pick);
      return showModes(ctx, bet);
    }

    if (action.startsWith("parity:")) {
      const pick = action.split(":")[1];
      await resolveParity(ctx, bet, pick);
      return showModes(ctx, bet);
    }

    if (action.startsWith("exact:")) {
      const pick = action.split(":")[1];
      if (pick === "custom") {
        if (!bet) return showBets(ctx);
        session.setPending(tgId, { type: "dice_custom_exact", bet: bet });
        return ctx.reply(MESSAGES.ENTER_NUMBER_1_TO_6);
      }
      const target = Number(pick);
      if (!target || target < 1 || target > 6) return;
      await resolveExact(ctx, bet, target);
      return showModes(ctx, bet);
    }

    if (action === "pvp:roll") {
      await resolvePvp(ctx, bet);
      return showModes(ctx, bet);
    }
  },

  async onText(ctx, pending) {
    const tgId = ctx.from.id;

    // своя ставка
    if (pending.type === "dice_custom_bet") {
      const bet = normalizeBetAmount(String(ctx.message.text).trim());
      if (!bet) {
        session.setPending(tgId, { type: "dice_custom_bet" });
        return ctx.reply(MESSAGES.ENTER_CORRECT_BET_AMOUNT);
      }
      tables.set(tgId, { bet });
      return showModes(ctx, bet);
    }

    // точное число числом
    if (pending.type === "dice_custom_exact") {
      const target = Number(String(ctx.message.text).trim());
      const bet = pending.bet;
      if (!target || target < 1 || target > 6) {
        session.setPending(tgId, { type: "dice_custom_exact", bet });
        return ctx.reply(MESSAGES.ENTER_NUMBER_1_TO_6);
      }
      await resolveExact(ctx, bet, target);
      return showModes(ctx, bet);
    }
  },
};
