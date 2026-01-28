// src/routes/callbacks/nav.js
const {
  showMain,
  showGames,
  showProfile,
  showBonusesList,
  showBonusDetails,
  showCaptcha,
  showSupport,
  showInfo,
} = require("../../ui/screens");

const { setPending } = require("../../state/session");

function registerNavCallbacks(bot, { safeAnswer }) {
  bot.callbackQuery("nav:main", async (ctx) => {
    await safeAnswer(ctx);
    await showMain(ctx, true);
  });

  bot.callbackQuery("nav:games", async (ctx) => {
    await safeAnswer(ctx);
    await showGames(ctx, true);
  });

  bot.callbackQuery("nav:profile", async (ctx) => {
    await safeAnswer(ctx);
    await showProfile(ctx, true);
  });

  bot.callbackQuery("nav:info", async (ctx) => {
    await safeAnswer(ctx);
    await showInfo(ctx, true);
  });


  bot.callbackQuery("nav:support", async (ctx) => {
    await safeAnswer(ctx);
    await showSupport(ctx, true);
    setPending(ctx.from.id, { type: "support_message" });
  });

  /* -------------------- BONUSES (NO DUPLICATES) -------------------- */

  bot.callbackQuery("nav:bonuses", async (ctx) => {
    await safeAnswer(ctx);
    await showBonusesList(ctx);
  });

  bot.callbackQuery("bonus:promo_enter", async (ctx) => {
    await safeAnswer(ctx);
    await ctx.reply("🎟 Введите промокод:");
    setPending(ctx.from.id, { type: "promo_code" });
  });

  bot.callbackQuery(/^bonus:open:(\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await showBonusDetails(ctx, ctx.match[1], null, null, null);
  });

  bot.callbackQuery(/^bonus:check:(\d+)$/, async (ctx) => {
    await safeAnswer(ctx);

    const bonusId = ctx.match[1];
    const { getOrCreateUser } = require("../../services/users");
    const { bonusesService } = require("../../services/bonuses");

    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
    const details = await bonusesService.getBonusDetails(user.id, BigInt(bonusId), ctx.api, ctx.from.id);

    await showBonusDetails(ctx, bonusId, details, ctx.api, ctx.from.id);
  });

  /* -------------------- CAPTCHA -------------------- */

  bot.callbackQuery(/^captcha:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const { checkCaptcha } = require("../../services/captcha");
    const { updateCaptchaPassed } = require("../../services/users");

    const answer = ctx.match[1];
    if (checkCaptcha(ctx.from.id, answer)) {
      await updateCaptchaPassed(ctx.from.id, true);
      await showMain(ctx, true);
    } else {
      await showCaptcha(ctx, true);
    }
  });

  /* -------------------- SUPPORT -------------------- */

  bot.callbackQuery("support:cancel", async (ctx) => {
    await safeAnswer(ctx);
    await showMain(ctx, true);
  });
}

module.exports = { registerNavCallbacks };
