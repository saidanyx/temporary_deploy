// src/games/mines.js
const { InlineKeyboard } = require("grammy");
const crypto = require("crypto");

const IMAGES = require("../assets/images");
const { render } = require("../ui/render");
const { betsKeyboard } = require("../ui/bets");
const session = require("../state/session");
const { MESSAGES } = require("../ui/messages");
const { getOrCreateUser } = require("../services/users");
const { addWin, createWinLedger } = require("./checkingBalance");
const { publishGameEventToChannel } = require("../services/channel");
const { calculateReferralBonus } = require("../services/referrals");
const { DEFAULTS, placeBet } = require("./betEngine");

// ====== STATE ======
// userId -> gameState
const games = new Map();

// ====== CONFIG ======
const GRID = 5;
const CELLS = GRID * GRID;

const HOUSE_EDGE = 0.06;
const BET_COOLDOWN_MS = DEFAULTS.cooldownMs;
const GAME_TTL_MS = 15 * 60 * 1000; // 15 minutes


// cleanup stale games
setInterval(() => {
  const now = Date.now();
  for (const [userId, st] of games.entries()) {
    if (now - st.createdAt > GAME_TTL_MS) {
      games.delete(userId);
    }
  }
}, 60 * 1000).unref?.();

// ====== HELPERS ======
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// fair multiplier based on survival probability for k safe opens
function calcMultiplier(minesCount, safeOpened) {
  const safeCells = CELLS - minesCount;

  let p = 1;
  for (let i = 0; i < safeOpened; i++) {
    p *= (safeCells - i) / (CELLS - i);
  }
  if (p <= 0) return 0;

  const fair = 1 / p;
  const withEdge = fair * (1 - HOUSE_EDGE);

  // casino-style rounding down to 2 decimals
  return Math.floor(withEdge * 100) / 100;
}

function rulesText() {
  return (
    "💣 *МИНЫ* 💣\n\n" +
    "*Правила игры:*\n" +
    "• Поле 5×5 = 25 клеток\n" +
    "• Ты выбираешь кол-во мин (1–24)\n" +
    "• Открывай клетки по одной\n" +
    "• За каждую безопасную клетку растёт коэффициент\n" +
    "• Забери выигрыш в любой момент\n\n" +
    "*Символы:*\n" +
    "🎁 Закрытая клетка\n" +
    "💎 Безопасная клетка\n" +
    "💣 Мина (проигрыш)\n"
  );
}

function mainKb() {
  return new InlineKeyboard()
    .text("🎮 Играть в боте", "mines:play")
    .row()
    .text("⬅️ Назад", "nav:games");
}

function minesCountKb() {
  return new InlineKeyboard()
    .text("1", "mines:pick:1").text("3", "mines:pick:3").text("5", "mines:pick:5").row()
    .text("7", "mines:pick:7").text("10", "mines:pick:10").text("15", "mines:pick:15").row()
    .text("20", "mines:pick:20").text("24", "mines:pick:24").row()
    .text("✏️ Свои мины", "mines:pick:custom").row()
    .text("⬅️ Назад", "mines:back");
}

function statusCaption(st) {
  const mult = calcMultiplier(st.mines, st.safeOpened);
  return (
    "💣 *МИНЫ* 💣\n\n" +
    `Ставка: *${st.bet} ₽*\n` +
    `Мины: *${st.mines}*\n` +
    `Открыто безопасных: *${st.safeOpened}*\n` +
    `Текущий коэффициент: *${mult.toFixed(2)}x*\n\n` +
    "Открывай клетки или нажми *Забрать* 💰"
  );
}

function explodeCaption(st, hitIdx) {
  return (
    "💥 *БУМ!*\n\n" +
    `Ты открыл мину 💣 (клетка ${hitIdx + 1})\n` +
    `Ставка *${st.bet} ₽* сгорела 😢`
  );
}

function cashoutCaption(st, mult, win) {
  return (
    "✅ *ВЫ ЗАБРАЛИ!*\n\n" +
    `Коэффициент: *${mult.toFixed(2)}x*\n` +
    `Ставка: *${st.bet} ₽*\n` +
    `Выигрыш: *${win} ₽* 🎉`
  );
}

// Keyboard for game (during play)
function gridKb(userId) {
  const st = games.get(userId);
  const kb = new InlineKeyboard();

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const idx = r * GRID + c;
      const opened = st.opened.has(idx);
      const label = opened ? "💎" : "🎁";
      kb.text(label, `mines:open:${idx}`);
    }
    kb.row();
  }

  kb.text("💰 Забрать", "mines:cashout").row();
  kb.text("⬅️ Назад", "nav:games");
  return kb;
}

// Revealed board (after end) — кнопки “пустые”
function revealedGridKb(st, hitIdx = null) {
  const kb = new InlineKeyboard();

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const idx = r * GRID + c;
      let label = "🎁";

      if (st.mineSet.has(idx)) label = "💣";
      else if (st.opened.has(idx)) label = "💎";
      else label = "▫️"; // не открывал, но безопасная

      // подсветка "попадания" можно эмодзи заменить, но без лишней экзотики:
      if (hitIdx !== null && idx === hitIdx) label = "💥";

      kb.text(label, "mines:noop");
    }
    kb.row();
  }

  // unified wording ("Играть в боте") across all games
  kb.text("🎮 Играть в боте", "mines:play").row();
  kb.text("⬅️ Назад", "nav:games");
  return kb;
}

function normalizeBetAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function normalizeMines(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const mines = Math.floor(n);
  if (mines < 1 || mines > 24) return null;
  return mines;
}


async function showRules(ctx, edit = true) {
  return render(ctx, {
    photo: IMAGES.MINES,
    caption: rulesText(),
    keyboard: mainKb(),
    edit,
  });
}

async function showBets(ctx) {
  return render(ctx, {
    photo: IMAGES.BET,
    caption: "💰 *Выберите ставку:*",
    keyboard: betsKeyboard("mines"),
    edit: true,
  });
}

async function showMinesCount(ctx) {
  return render(ctx, {
    photo: IMAGES.MINES,
    caption: "💣 *Выберите количество мин (1–24):*",
    keyboard: minesCountKb(),
    edit: true,
  });
}

function createMinesSet(mines) {
  const indices = Array.from({ length: CELLS }, (_, i) => i);
  shuffle(indices);
  return new Set(indices.slice(0, mines));
}

async function stopGame(userId) {
  games.delete(userId);
}

async function startGame(ctx, bet, mines) {
  const userId = ctx.from.id;

  const nb = normalizeBetAmount(bet);
  if (!nb) {
    return ctx.reply(MESSAGES.INVALID_AMOUNT);
  }

  const nm = normalizeMines(mines);
  if (!nm) {
    return ctx.reply("❌ Количество мин должно быть от 1 до 24.");
  }

  // если игра уже была — закрываем (как у крупных: новая ставка = новая игра)
  await stopGame(userId);

  // Validate bet + cooldown, then atomic deduct + BET ledger
  const placed = await placeBet(ctx, nb, {
    gameId: "mines",
    backKb: () => mainKb(),
    meta: { game: "mines", mines: nm },
    cooldownMs: BET_COOLDOWN_MS,
  });
  if (!placed) return;
  const { user, dbUserId, balanceRubles } = placed;

  const st = {
    bet: nb,
    mines: nm,
    mineSet: createMinesSet(nm),
    opened: new Set(),
    safeOpened: 0,

    // жизненный цикл
    alive: true,
    settling: false,
    createdAt: Date.now(),

    dbUserId,
    username: user?.username,
    balanceRubles,
  };

  games.set(userId, st);

  return render(ctx, {
    photo: IMAGES.MINES,
    caption: statusCaption(st),
    keyboard: gridKb(userId),
    edit: true,
  });
}

async function openCell(ctx, idx) {
  const userId = ctx.from.id;
  const st = games.get(userId);
  if (!st || !st.alive || st.settling) return;

  if (!Number.isInteger(idx) || idx < 0 || idx >= CELLS) return;
  if (st.opened.has(idx)) return;

  st.opened.add(idx);

  // hit mine
  if (st.mineSet.has(idx)) {
    st.settling = true;
    st.alive = false;
    games.delete(userId);

    await render(ctx, {
      photo: IMAGES.MINES,
      caption: explodeCaption(st, idx),
      keyboard: revealedGridKb(st, idx),
      edit: true,
    });

// Referral bonus: only for losses
try {
  await calculateReferralBonus(st.dbUserId, st.bet);
} catch (e) {
  console.error("Referral bonus error:", e);
}
    // publish loss to channel
    await publishGameEventToChannel("result", {
      gameName: "💣 Мины",
      gameId: "mines",
      username: st.username,
      tgId: userId,
      bet: st.bet,
      mult: 0,
      payout: 0,
      isDemo: false,
      isDraw: false,
      isRefund: false,
    });

    return;
  }

  // safe
  st.safeOpened += 1;

  return render(ctx, {
    photo: IMAGES.MINES,
    caption: statusCaption(st),
    keyboard: gridKb(userId),
    edit: true,
  });
}

async function cashout(ctx) {
  const userId = ctx.from.id;
  const st = games.get(userId);
  if (!st || !st.alive || st.settling) return;

  // как у крупных: нельзя “забрать” без единого открытия
  if (st.safeOpened < 1) {
    return ctx.reply("⚠️ Сначала открой хотя бы 1 клетку, затем можно забрать 💰");
  }

  st.settling = true;

  const mult = calcMultiplier(st.mines, st.safeOpened);
  const win = Math.floor(st.bet * mult);

  // credit win
  await addWin(st.dbUserId, win);
  await createWinLedger(st.dbUserId, win, {
    game: "mines",
    mines: st.mines,
    safeOpened: st.safeOpened,
    mult,
    bet: st.bet,
  });

  games.delete(userId);

  // publish win to channel
  await publishGameEventToChannel("result", {
    gameName: "💣 Мины",
    gameId: "mines",
    username: st.username,
    tgId: userId,
    bet: st.bet,
    mult,
    payout: win,
    isDemo: false,
    isDraw: false,
    isRefund: false,
  });

  return render(ctx, {
    photo: IMAGES.MINES,
    caption: cashoutCaption(st, mult, win),
    keyboard: revealedGridKb(st, null),
    edit: true,
  });
}

module.exports = {
  id: "mines",

  async open(ctx) {
    return showRules(ctx, true);
  },

  async onCallback(ctx, action) {
    // полезно: убрать "часики" на кнопке
    try {
      await ctx.answerCallbackQuery();
    } catch (_) {}

    if (action === "noop") return;

    if (action === "play") return showBets(ctx);
    if (action === "back") return showRules(ctx, true);

    // выход через меню/назад обычно роутится вне игры,
    // но на всякий случай: если пришёл stop — просто закрываем
    if (action === "stop") {
      await stopGame(ctx.from.id);
      return showRules(ctx, true);
    }

    if (action === "cashout") return cashout(ctx);

    // ставка (betsKeyboard("mines") должен давать "bet:<amount>" после роутинга)
    if (action.startsWith("bet:")) {
      const v = action.split(":")[1];

      if (v === "custom") {
        session.setPending(ctx.from.id, { type: "mines_custom_bet" });
        return ctx.reply(MESSAGES.ENTER_BET_AMOUNT);
      }

      const bet = normalizeBetAmount(v);
      if (!bet) return ctx.reply(MESSAGES.INVALID_AMOUNT);

      // сохраняем ставку и идём выбирать мины
      session.setPending(ctx.from.id, { type: "mines_pick_mines", bet });
      return showMinesCount(ctx);
    }

    // выбор мин (кнопки дают callback "mines:pick:<n>" => action "pick:<n>")
    if (action.startsWith("pick:")) {
      const pending = session.popPending(ctx.from.id);
      const bet = pending?.bet;

      if (!bet) return showBets(ctx);

      const v = action.split(":")[1];

      if (v === "custom") {
        session.setPending(ctx.from.id, { type: "mines_custom_mines", bet });
        return ctx.reply(MESSAGES.ENTER_MINES_COUNT);
      }

      const mines = normalizeMines(v);
      if (!mines) return ctx.reply(MESSAGES.INVALID_MINES_COUNT);

      return startGame(ctx, bet, mines);
    }

    // открыть клетку (callback "mines:open:<idx>" => action "open:<idx>")
    if (action.startsWith("open:")) {
      const idx = Number(action.split(":")[1]);
      if (Number.isNaN(idx)) return;
      return openCell(ctx, idx);
    }
  },

  async onText(ctx, pending) {
    if (!pending?.type) return;

    // custom bet
    if (pending.type === "mines_custom_bet") {
      const bet = normalizeBetAmount(String(ctx.message.text).trim());
      if (!bet) {
        session.setPending(ctx.from.id, { type: "mines_custom_bet" });
        return ctx.reply(MESSAGES.ENTER_CORRECT_BET_AMOUNT);
      }
      session.setPending(ctx.from.id, { type: "mines_pick_mines", bet });
      return showMinesCount(ctx);
    }

    // custom mines
    if (pending.type === "mines_custom_mines") {
      const mines = normalizeMines(String(ctx.message.text).trim());
      const bet = pending.bet;

      if (!bet) return showBets(ctx);

      if (!mines) {
        session.setPending(ctx.from.id, { type: "mines_custom_mines", bet });
        return ctx.reply(MESSAGES.ENTER_MINES_COUNT);
      }

      return startGame(ctx, bet, mines);
    }
  },
};
