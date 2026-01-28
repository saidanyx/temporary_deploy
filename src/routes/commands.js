const { showMain, showAdminPanel, showCaptcha, showGames } = require("../ui/screens");
const { getOrCreateUser } = require("../services/users");
const { adminService } = require("../services/admin");

const GAMES_START_PAYLOAD = "nav_games";

// универсально достаём payload
function getStartPayload(ctx) {
  const fromMatch = (ctx.match || "").trim();
  if (fromMatch) return fromMatch;

  const text = (ctx.message?.text || "").trim(); // "/start xxx"
  const parts = text.split(/\s+/);
  return (parts.slice(1).join(" ") || "").trim();
}

// оставляем только допустимый формат рефкода (подстрой под себя)
function normalizeRefCode(payload) {
  if (!payload) return null;

  // если это наши навигационные payload'ы — НЕ считаем реферальным
  const reserved = new Set([
    GAMES_START_PAYLOAD,
    "nav:games",
    "nav_main",
    "nav:main",
    "nav_profile",
    "nav:support",
    "nav_support",
    "nav_deposit",
    "nav_bonuses",
    "nav_info",
  ]);
  if (reserved.has(payload)) return null;

  // Telegram deep-link payload обычно короткий и без пробелов
  // если у тебя рефкоды другие — поменяй regex
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(payload)) return null;

  return payload;
}

function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    // Handle /start only in private chats
    if (ctx.chat?.type !== "private") return;
    const from = ctx.from;
    if (!from) return;
    const payload = getStartPayload(ctx);

    // 👀 очень поможет в отладке: что реально пришло из канала
    console.log("[/start] payload:", payload, "text:", ctx.message?.text);

    // ✅ вход в меню игр
    if (payload === GAMES_START_PAYLOAD || payload === "nav:games") {
  // /start — это обычное сообщение, надо ОТПРАВЛЯТЬ новое, а не редактировать
  return showGames(ctx, false);
}


    const referrer_code = normalizeRefCode(payload);

    const user = await getOrCreateUser(
      from.id,
      from.username,
      referrer_code
    );

    if (user.captcha_passed) {
      await showMain(ctx, false);
    } else {
      await showCaptcha(ctx, false);
    }
  });

  bot.command("admin", async (ctx) => {
    // channel_post / anonymous posts have no `from`
    const from = ctx.from;
    if (!from) return;
    const adminIds = await adminService.getAdminIds();
    if (!adminIds.includes(from.id)) return;
    await showAdminPanel(ctx, false);
  });
}

module.exports = { registerCommands };