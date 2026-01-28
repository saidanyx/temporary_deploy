// src/services/channel.js
//
// Publishes events to Telegram channels.
// The bot instance is injected from src/index.js via initChannelBot(bot).

"use strict";

const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const IMAGES = require("../assets/images");
const registry = require("../games/registry");

let bot = null;
let botUsername = null;
const GAMES_MENU_START_PAYLOAD = "nav_games";

/**
 * Store bot instance for later channel publishing.
 * @param {import('grammy').Bot} botInstance
 */
function initChannelBot(botInstance) {
  bot = botInstance;
  // botInfo may be unavailable until bot.init(); we resolve lazily via getMe()
  botUsername = null;
}

async function ensureBotUsername() {
  if (botUsername || !bot) return botUsername;
  try {
    const me = await bot.api.getMe();
    botUsername = me?.username || null;
  } catch {
    botUsername = null;
  }
  return botUsername;
}


async function getGamesChannelChatId() {
  const { adminService } = require("./admin");
  return adminService.getGamesChannelChatId();
}

function formatRub(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  // ru-RU produces comma decimal separator and trims trailing zeros with minFractionDigits=0
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function formatMultiplier(mult) {
  const v = Number(mult);
  if (!Number.isFinite(v)) return null;
  return (Math.round(v * 100) / 100).toString().replace(/\.0+$/, "").replace(/(\.[1-9])0$/, "$1");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateTimeRu(d = new Date()) {
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${dd}.${mm}.${yyyy}, ${hh}:${mi}:${ss}`;
}

function resolveGameTitle(gameName, gameId) {
  // Prefer registry titles (they include emoji) for consistency.
  if (gameId) {
    const found = registry.listGames().find((g) => g.id === gameId);
    if (found?.title) return found.title;
  }
  const clean = (gameName || "").trim();
  return clean || "Игра";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildChannelPost(payload) {
  const gameId = payload?.gameId || payload?.game_id || null;
  const gameTitle = resolveGameTitle(payload?.gameName, gameId);

  // Prefer human-readable name without @
  let player = (payload?.playerName || payload?.player || payload?.username || payload?.name || "Игрок").toString();
  player = player.startsWith("@") ? player.slice(1) : player;
  player = escapeHtml(player);

  const bet = Number(payload?.bet || 0);
  const payout = Number(payload?.payout || 0);

  // For partial refunds (e.g. surrender), allow overriding displayed refund amount.
  const refundAmountRaw = payload?.refundAmount ?? payload?.refund_amount;
  const refundAmount = Number(refundAmountRaw);

  const isRefund = Boolean(payload?.isRefund || payload?.isDraw || payload?.isRefunded);
  const isWin = !isRefund && payout > 0;

  const betStr = formatRub(bet);
  const payoutForDisplay = isRefund && Number.isFinite(refundAmount) ? refundAmount : (isRefund ? bet : payout);
  const payoutStr = formatRub(payoutForDisplay);

  const multRaw =
    payload?.mult ??
    (bet > 0 && payout > 0 ? payout / bet : null);

  const mult = isWin ? formatMultiplier(multRaw) : null;

  const safeTitle = escapeHtml(gameTitle);

  const gamesMenuLink = botUsername
    ? `https://t.me/${botUsername}?start=${encodeURIComponent(GAMES_MENU_START_PAYLOAD)}`
    : null;

  // Make the game title clickable (leads to Games menu, not a single game)
  const header = gamesMenuLink
    ? `<a href="${gamesMenuLink}">${safeTitle}</a> | Результаты`
    : `${safeTitle} | Результаты`;
  const statusLine = isRefund
    ? "➖ Возврат"
    : isWin
      ? `✅ Выигрыш${mult ? ` x${mult}` : ""}`
      : "❌ Проигрыш";

  const captionLines = [
    header,
    "",
    `👤 Игрок: ${player}`,
    `💰 Ставка: ${betStr} ₽`,
    statusLine,
    `💸 Выплата: ${payoutStr} ₽`,
    "",
    `⏱ ${formatDateTimeRu(new Date())}`,
  ];

  // Button should also lead to Games menu (not main menu)
  const reply_markup = gamesMenuLink
    ? { inline_keyboard: [[{ text: gameTitle, url: gamesMenuLink }]] }
    : undefined;

  const photoId = isRefund ? (IMAGES.CHANNEL || IMAGES.BET) : (isWin ? IMAGES.WIN : IMAGES.LOSS);

  return {
    photoId,
    caption: captionLines.join("\n"),
    reply_markup,
  };
}

/**
 * Publish a game event (win/loss/refund) to the configured public channel.
 * Signature is kept for backwards compatibility with existing games.
 *
 * @param {string} kind - for now used: "result"
 * @param {object} payload
 */
async function publishGameEventToChannel(kind, payload) {
  try {
    if (!bot) return;

    const chatId = await getGamesChannelChatId();
    if (!chatId) return;


    await ensureBotUsername();

    const { photoId, caption, reply_markup } = buildChannelPost(payload || {});
    if (!caption) return;

    await bot.api.sendPhoto(chatId, photoId, {
      caption,
      parse_mode: "HTML",
      reply_markup,
    });
  } catch (e) {
    // Do not crash the bot because of channel publishing.
    console.error("publishGameEventToChannel error:", e);
  }
}

/**
 * Publish a (fake) bet to the configured public channel.
 * Safe no-op if bot or channel_id is missing.
 */
async function publishFakeBetToChannel({ gameName, gameId, username, bet, resultSummary, payout }) {
  return publishGameEventToChannel("result", {
    gameName,
    gameId,
    username,
    bet,
    payout,
    resultSummary,
    // Fake bets are either win/loss (refund unlikely)
    isDemo: true,
  });
}

/**
 * Publish a (fake) approved withdrawal to the configured payments channel.
 * Safe no-op if bot or payments channel is missing.
 */
async function publishFakePayoutToPaymentsChannel({ username, amount }) {
  try {
    if (!bot) return;

    const { adminService } = require("./admin");
    const chatId = await adminService.getPaymentsChannelChatId();
    if (!chatId) return;

    const playerRaw = (username || "Игрок").toString();
    const player = escapeHtml(playerRaw);
    const amountStr = formatRub(amount);
    const when = formatDateTimeRu(new Date());

    const caption =
      `<b>✅ Вывод одобрен</b>\n\n` +
      `👤 Игрок: ${player}\n` +
      `💸 Сумма: <b>${amountStr} ₽</b>\n\n` +
      `🕒 Время: ${when}`;

    await bot.api.sendPhoto(chatId, IMAGES.WITHDRAWALS_CHANNEL, {
      caption,
      parse_mode: "HTML",
    });
  } catch (e) {
    console.error("publishFakePayoutToPaymentsChannel error:", e);
  }
}


async function publishWithdrawalApprovedToPaymentsChannel(withdrawalId) {
  try {
    if (!bot) return;

    const { adminService } = require("./admin");
    const chatId = await adminService.getPaymentsChannelChatId();
    if (!chatId) return;

    const w = await prisma.withdrawals.findUnique({
      where: { id: BigInt(withdrawalId) },
      include: { user: true },
    });
    if (!w) return;

    const u = w.user || {};
    const player =
      u.first_name ||
      (u.username ? `@${u.username}` : u.tg_id ? `ID ${u.tg_id}` : `ID ${w.user_id}`);

    const amount = formatRub(w.amount);
    const when = formatDateTimeRu(new Date());

    const caption =
      `<b>✅ Вывод одобрен</b>\n\n` +
      `👤 Игрок: ${player}\n` +
      `💸 Сумма: <b>${amount} ₽</b>\n\n` +
      `🕒 Время: ${when}`;

    await bot.api.sendPhoto(
      chatId,
      IMAGES.WITHDRAWALS_CHANNEL, // ← сюда фото
      {
        caption,
        parse_mode: "HTML",
      }
    );
  } catch (e) {
    console.error("publishWithdrawalApprovedToPaymentsChannel error:", e);
  }
}


module.exports = {
  initChannelBot,
  publishGameEventToChannel,
  publishFakeBetToChannel,
  publishFakePayoutToPaymentsChannel,
  publishWithdrawalApprovedToPaymentsChannel,
};
