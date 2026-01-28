// src/routes/callbacks/admin.js
const {
  showAdminPanel,
  showBetLimitsPanel,
  showAdminBroadcastPanel,
  showTimePanel,
  showMinPanel,
  showMaxPanel,
  showChannelsPanel,
  showFakeBetsPanel,
  showFakePayoutsPanel,
} = require("../../ui/screens");

const { service: fakeBetsService } = require("../../services/fakeBets");
const { service: fakePayoutsService } = require("../../services/fakePayouts");
const { setPending, getPending, clearPending } = require("../../state/session");

function registerAdminCallbacks(bot, { safeAnswer, isAdmin }) {
  /* -------------------- ADMIN -------------------- */

  bot.callbackQuery("admin:export_users", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const { exportUsersXlsx } = require("../../services/exportUsersXlsx");
    await exportUsersXlsx(ctx);
  });



  bot.callbackQuery("admin:set_time", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showTimePanel(ctx, true);
  });

  bot.callbackQuery("admin:set_min", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showMinPanel(ctx, true);
  });

  bot.callbackQuery("admin:set_max", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showMaxPanel(ctx, true);
  });

  bot.callbackQuery(/^admin:min:(\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const val = parseInt(ctx.match[1]);
    await fakeBetsService.setConfig({ min_sec: val });
    await showAdminPanel(ctx, true);
  });

  bot.callbackQuery(/^admin:max:(\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const val = parseInt(ctx.match[1]);
    await fakeBetsService.setConfig({ max_sec: val });
    await showAdminPanel(ctx, true);
  });


  // Alias: explicit panel navigation (used by some screens)
  bot.callbackQuery("admin:panel", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;
    await showAdminPanel(ctx, true);
  });

  /* -------------------- ADMIN BROADCAST -------------------- */

  bot.callbackQuery("admin:broadcast", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showAdminBroadcastPanel(ctx, true);
  });

  bot.callbackQuery(/^admin:broadcast:pick:(DEPOSIT_15_NEWBIE|DAILY_RANDOM_10_5000)$/, async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const bonusType = ctx.match[1];

    clearPending(ctx.from.id);
    setPending(ctx.from.id, { type: "admin_bonus_broadcast_text", bonus_type: bonusType });

    await ctx.reply(
      `✍️ Отправьте текст рассылки для бонуса *${bonusType}* (Markdown).\n\nЧтобы отменить: /start → Админ → Рассылка`,
      { parse_mode: "Markdown" }
    );
  });


  bot.callbackQuery("admin:back", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showAdminPanel(ctx, true);
  });

  bot.callbackQuery("admin:fake_bets", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showFakeBetsPanel(ctx, true);
  });

  bot.callbackQuery("admin:fake_bets:toggle", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const cfg = await fakeBetsService.getConfig();
    await fakeBetsService.setConfig({ enabled: !cfg.enabled });
    await showFakeBetsPanel(ctx, true);
  });

  bot.callbackQuery("admin:fake_bets:set_time_direct", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте минимальное и максимальное время через пробел (например: 10 120):");
    setPending(ctx.from.id, { type: "admin_custom_fake_bets_time" });
  });

  bot.callbackQuery("admin:fake_payouts", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showFakePayoutsPanel(ctx, true);
  });

  bot.callbackQuery("admin:fake_payouts:toggle", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const cfg = await fakePayoutsService.getConfig();
    await fakePayoutsService.setConfig({ enabled: !cfg.enabled });
    await showFakePayoutsPanel(ctx, true);
  });

  bot.callbackQuery("admin:fake_payouts:set_time_direct", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте минимальное и максимальное время фейк-выплат через пробел (например: 120 600):");
    setPending(ctx.from.id, { type: "admin_custom_fake_payouts_time" });
  });

  /* -------------------- ADMIN: BET LIMITS -------------------- */

  bot.callbackQuery("admin:bet_limits", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showBetLimitsPanel(ctx, true);
  });

  bot.callbackQuery("admin:bet_limits:edit", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте минимальную и максимальную ставку через пробел (например: 10 10000):");
    setPending(ctx.from.id, { type: "admin_set_min_max_bet" });
  });

  bot.callbackQuery("admin:channels", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await showChannelsPanel(ctx, true);
  });

  bot.callbackQuery("admin:set_news_channel_url", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте ссылку на ✔️ Новостной канал (пример: https://t.me/your_channel или @your_channel)");
    setPending(ctx.from.id, { type: "admin_set_news_channel_url" });
  });

  bot.callbackQuery("admin:set_games_channel_url", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте ссылку на 🎮 Канал игр (пример: https://t.me/your_channel или @your_channel)");
    setPending(ctx.from.id, { type: "admin_set_games_channel_url" });
  });

  bot.callbackQuery("admin:set_payments_channel_url", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте ссылку на 💰 Канал выплат (пример: https://t.me/your_channel или @your_channel).\n\nЕсли в ссылке случайно есть лишняя \"c\" (t.me/c/username) — бот поправит автоматически.");
    setPending(ctx.from.id, { type: "admin_set_payments_channel_url" });
  });

  bot.callbackQuery("admin:set_percent_referrals", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте процент реф.бонуса (0..100). Пример: 5 или 7.5");
    setPending(ctx.from.id, { type: "admin_set_percent_referrals" });
  });

  bot.callbackQuery("admin:set_rules_text", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply(
      "Отправьте текст правил (Markdown).\n\nЧтобы очистить и использовать встроенный текст — отправьте: /empty"
    );
    setPending(ctx.from.id, { type: "admin_set_rules_text" });
  });

  bot.callbackQuery("admin:replenish_balance", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    await ctx.reply("Отправьте ID пользователя и сумму через пробел (например: 123456789 100.50)");
    setPending(ctx.from.id, { type: "admin_replenish_balance" });
  });

  /* -------------------- ADMIN WITHDRAWALS -------------------- */

  bot.callbackQuery("admin:withdrawals", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const { showAdminWithdrawalsList } = require("../../ui/adminWithdrawals");
    await showAdminWithdrawalsList(ctx, true, 0);
  });

  bot.callbackQuery(/^admin:withdrawals:page:(\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const offset = parseInt(ctx.match[1], 10) || 0;
    const { showAdminWithdrawalsList } = require("../../ui/adminWithdrawals");
    await showAdminWithdrawalsList(ctx, true, offset);
  });

  bot.callbackQuery(/^admin:withdrawals:approve:(\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const id = BigInt(ctx.match[1]);
    const { adminWithdrawalsService } = require("../../services/adminWithdrawals");

    try {
      const updated = await adminWithdrawalsService.approve(id);
      const { publishWithdrawalApprovedToPaymentsChannel } = require("../../services/channel");
      await publishWithdrawalApprovedToPaymentsChannel(updated.id);
      const { showAdminWithdrawalsList } = require("../../ui/adminWithdrawals");
      await showAdminWithdrawalsList(ctx, true, 0);
    } catch (e) {
      await showAdminPanel(ctx, true, `❌ Ошибка: ${e?.message || String(e)}`);
    }
  });

  bot.callbackQuery(/^admin:withdrawals:reject:(\d+)$/, async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const id = BigInt(ctx.match[1]);
    const { adminWithdrawalsService } = require("../../services/adminWithdrawals");

    try {
      await adminWithdrawalsService.reject(id);
      const { showAdminWithdrawalsList } = require("../../ui/adminWithdrawals");
      await showAdminWithdrawalsList(ctx, true, 0);
    } catch (e) {
      await showAdminPanel(ctx, true, `❌ Ошибка: ${e?.message || String(e)}`);
    }
  });

  /* -------------------- ADMIN PROMOS -------------------- */

  bot.callbackQuery("admin:promos", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const { showPromoAdmin } = require("../../ui/adminPromos");
    await showPromoAdmin(ctx, true);
  });

  bot.callbackQuery("admin:promo:create", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const { showPromoCreateStep } = require("../../ui/adminPromos");
    clearPending(ctx.from.id);
    setPending(ctx.from.id, { type: "admin_promo_create", step: "message", data: {} });

    await showPromoCreateStep(
      ctx,
      "Введите *текст рассылки* всем пользователям (можно с эмодзи).\n\nПодсказка: промокод и % будут добавлены автоматически.",
      true
    );
  });

  bot.callbackQuery("admin:promo:cancel", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const { showPromoAdmin } = require("../../ui/adminPromos");
    clearPending(ctx.from.id);
    await showPromoAdmin(ctx, true, "❌ Отменено");
  });

  bot.callbackQuery("admin:promo:confirm", async (ctx) => {
    await safeAnswer(ctx);
    if (!(await isAdmin(ctx))) return;

    const { showPromoAdmin } = require("../../ui/adminPromos");
    const { promoDepositsService } = require("../../services/promoDeposits");

    const pending = getPending(ctx.from.id);
    if (!pending || pending.type !== "admin_promo_create" || pending.step !== "confirm") {
      await showPromoAdmin(ctx, true, "⚠️ Нет данных для подтверждения");
      return;
    }

    const data = pending.data || {};

    try {
      const promo = await promoDepositsService.createPromo({
        name: data.name,
        code: data.code,
        percent: data.percent,
        ttlDays: 30,
      });

      const tgIds = await promoDepositsService.listAllUserTgIds();

      const expiresDate = new Date(promo.expires_at).toISOString().slice(0, 10);
      const baseText = (data.message || "").trim();

      const msg = `${baseText}

🎟 Промокод: *${promo.code}*
🎁 Бонус к депозиту: *${Number(promo.percent)}%*
⏳ Действует до *${expiresDate}*

Активировать: Бонусы → Ввести промокод`;

      const batchSize = 25;
      let sent = 0;

      for (let i = 0; i < tgIds.length; i += batchSize) {
        const batch = tgIds.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (id) => {
            try {
              await ctx.api.sendMessage(id, msg, { parse_mode: "Markdown" });
              sent += 1;
            } catch {
              // skip
            }
          })
        );

        await new Promise((r) => setTimeout(r, 1000));
      }

      clearPending(ctx.from.id);
      await showPromoAdmin(ctx, true, `✅ Создано и разослано: ${sent}/${tgIds.length}`);
    } catch (e) {
      await showPromoAdmin(ctx, true, `❌ Ошибка: ${e?.message || String(e)}`);
    }
  });
}

module.exports = { registerAdminCallbacks };
