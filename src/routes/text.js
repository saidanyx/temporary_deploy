// src/routes/text.js
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

// NOTE: keep imports strictly to exported screen functions to avoid require-time crashes
const { showProfile, showAdminPanel, showBonusesList, showTopupInvoice } = require("../ui/screens");

const rocket = require("../games/rocket");
const mines = require("../games/mines");
const blackjack = require("../games/blackjack");
const dice = require("../games/dice");

const slots = require("../games/slots");
const bowling = require("../games/bowling");
const basketball = require("../games/basketball");
const football = require("../games/football");
const darts = require("../games/darts");

const rps = require("../games/rps");
const wheel = require("../games/wheel");
const boxes = require("../games/boxes");

const { InlineKeyboard } = require("grammy");

// ✅ session
const { setPending, getPending, popPending, clearPending } = require("../state/session");

function registerText(bot) {
  bot.on("message:text", async (ctx) => {
    // ✅ ВАЖНО: сначала смотрим pending НЕ удаляя (для мастеров: промо/админ-промо)
    const peek = getPending(ctx.from.id);

    /* -------------------- USER: ENTER PROMO CODE -------------------- */
    if (peek?.type === "promo_code") {
      clearPending(ctx.from.id);

      const { getOrCreateUser } = require("../services/users");
      const { promoDepositsService } = require("../services/promoDeposits");

      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const code = String(ctx.message?.text || "").trim();

      const res = await promoDepositsService.activatePromoForUser(user.id, code);
      if (!res.ok) {
        await ctx.reply(`❌ ${res.reason}`);
      } else {
        const expires = new Date(res.promo.expires_at).toISOString().slice(0, 10);
        if (res.status === "QUEUED") {
          await ctx.reply(
            `⏳ Промокод добавлен в очередь!

🎁 Бонус к депозиту — ${Number(res.promo.percent)}%

Когда у вас освободится слот (макс. 2 активных), он станет активным автоматически.`
          );
        } else {
          await ctx.reply(
            `✅ Промокод активирован!

🎁 Одноразовый бонус к депозиту — ${Number(res.promo.percent)}%`
          );
        }
      }

      await showBonusesList(ctx);
      return;
    }

    /* -------------------- ADMIN: PROMO CREATE WIZARD -------------------- */
    if (peek?.type === "admin_promo_create") {
      const { showPromoCreateStep, showPromoConfirm } = require("../ui/adminPromos");
      const text = String(ctx.message?.text || "").trim();

      // step: message
      if (peek.step === "message") {
        if (!text) {
          await showPromoCreateStep(ctx, "Введите *текст рассылки* (не пустой)", true);
          return;
        }
        const data = { ...(peek.data || {}), message: text };
        setPending(ctx.from.id, { type: "admin_promo_create", step: "name", data });
        await showPromoCreateStep(ctx, "Введите *название* промокода (например: Зимний буст)", true);
        return;
      }

      // step: name
      if (peek.step === "name") {
        if (!text) {
          await showPromoCreateStep(ctx, "Введите *название* промокода (не пустое)", true);
          return;
        }
        const data = { ...(peek.data || {}), name: text };
        setPending(ctx.from.id, { type: "admin_promo_create", step: "code", data });
        await showPromoCreateStep(ctx, "Введите *код* промокода (латиница/цифры, например WINTER20)", true);
        return;
      }

      // step: code
      if (peek.step === "code") {
        const code = text.toUpperCase();
        if (!/^[A-Z0-9_]{3,32}$/.test(code)) {
          await showPromoCreateStep(ctx, "Код должен быть 3–32 символа: A-Z 0-9 _", true);
          return;
        }
        const data = { ...(peek.data || {}), code };
        setPending(ctx.from.id, { type: "admin_promo_create", step: "percent", data });
        await showPromoCreateStep(ctx, "Введите *процент* (например 15 или 20.5)", true);
        return;
      }

      // step: percent
      if (peek.step === "percent") {
        const percent = Number(text.replace(",", "."));
        if (!percent || Number.isNaN(percent) || percent <= 0) {
          await showPromoCreateStep(ctx, "Процент должен быть числом > 0", true);
          return;
        }
        const data = { ...(peek.data || {}), percent };
        setPending(ctx.from.id, { type: "admin_promo_create", step: "confirm", data });
        await showPromoConfirm(ctx, data, true);
        return;
      }

      // step confirm: ждём кнопку в callbacks.js (admin:promo:confirm)
      if (peek.step === "confirm") {
        await ctx.reply("Нажмите «✅ Создать и разослать» или «❌ Отменить».");
        return;
      }
    }

    // ✅ Остальной pending — как раньше: popPending (одно сообщение = одно действие)
    const pending = popPending(ctx.from.id);
    if (!pending) return;

    // games custom bets
    if (pending.type === "dice_custom_bet") return dice.onText(ctx, pending);
    if (pending.type === "dice_custom_exact") return dice.onText(ctx, pending);

    if (pending.type === "rocket_custom_bet") return rocket.onText(ctx, pending);
    if (pending.type === "mines_custom_bet") return mines.onText(ctx, pending);
    if (pending.type === "mines_custom_mines") return mines.onText(ctx, pending);
    if (pending.type === "blackjack_custom_bet") return blackjack.onText(ctx, pending);

    if (pending.type === "slots_custom_bet") return slots.onText(ctx, pending);
    if (pending.type === "bowling_custom_bet") return bowling.onText(ctx, pending);
    if (pending.type === "basketball_custom_bet") return basketball.onText(ctx, pending);
    if (pending.type === "football_custom_bet") return football.onText(ctx, pending);
    if (pending.type === "darts_custom_bet") return darts.onText(ctx, pending);

    if (pending.type === "rps_custom_bet") return rps.onText(ctx, pending);
    if (pending.type === "wheel_custom_bet") return wheel.onText(ctx, pending);
    if (pending.type === "boxes_custom_bet") return boxes.onText(ctx, pending);

    // ---- Admin: channel URLs ----
    if (pending.type === "admin_set_news_channel_url") {
      const { adminService } = require("../services/admin");
      try {
        await adminService.setNewsChannelUrl(ctx.message.text);
        await ctx.reply("✅ Новостной канал сохранён");
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Ошибка")}`);
        return;
      }
      await showAdminPanel(ctx, true);
      return;
    }

    if (pending.type === "admin_set_games_channel_url") {
      const { adminService } = require("../services/admin");
      try {
        await adminService.setGamesChannelUrl(ctx.message.text);
        await ctx.reply("✅ Ссылка на канал игр сохранена");
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Ошибка")}`);
        return;
      }
      await showAdminPanel(ctx, true);
      return;
    }

    if (pending.type === "admin_set_payments_channel_url") {
      const { adminService } = require("../services/admin");
      try {
        await adminService.setPaymentsChannelUrl(ctx.message.text);
        await ctx.reply("✅ Ссылка на канал выплат сохранена");
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Ошибка")}`);
        return;
      }
      await showAdminPanel(ctx, true);
      return;
    }

    if (pending.type === "admin_set_percent_referrals") {
      const { adminService } = require("../services/admin");
      try {
        await adminService.setPercentReferrals(ctx.message.text);
        await ctx.reply("✅ Процент реферального бонуса сохранён");
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Ошибка")}`);
        return;
      }
      await showAdminPanel(ctx, true);
      return;
    }

    if (pending.type === "admin_set_rules_text") {
      const { adminService } = require("../services/admin");
      const t = String(ctx.message.text || "");

      // allow special commands to reset/empty
      if (t.trim() === "/empty" || t.trim() === "/reset") {
        await adminService.setRulesText("");
        await ctx.reply("✅ Текст правил сброшен (используется встроенный)");
        await showAdminPanel(ctx, true);
        return;
      }

      try {
        await adminService.setRulesText(t);
        await ctx.reply("✅ Текст правил сохранён");
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Ошибка")}`);
        return;
      }
      await showAdminPanel(ctx, true);
      return;
    }
    if (pending.type === "admin_custom_fake_bets_time") {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length !== 2) {
        await ctx.reply("❌ Неверный формат. Используйте: 10 120");
        return;
      }
      const minVal = parseInt(parts[0], 10);
      const maxVal = parseInt(parts[1], 10);
      if (isNaN(minVal) || isNaN(maxVal) || minVal <= 0 || maxVal <= 0 || minVal >= maxVal) {
        await ctx.reply("❌ Неверные значения.");
        return;
      }
      const { service } = require("../services/fakeBets");
      await service.setConfig({ min_sec: minVal, max_sec: maxVal });
      await ctx.reply(`✅ Диапазон времени фейк-ставок установлен: ${minVal}–${maxVal} сек`);
      return;
    }

    if (pending.type === "admin_custom_fake_payouts_time") {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length !== 2) {
        await ctx.reply("❌ Неверный формат. Используйте: 120 600");
        return;
      }
      const minVal = parseInt(parts[0], 10);
      const maxVal = parseInt(parts[1], 10);
      if (isNaN(minVal) || isNaN(maxVal) || minVal <= 0 || maxVal <= 0 || minVal >= maxVal) {
        await ctx.reply("❌ Неверные значения.");
        return;
      }

      const { service } = require("../services/fakePayouts");
      await service.setConfig({ min_sec: minVal, max_sec: maxVal });

      const { showFakePayoutsPanel } = require("../ui/screens");
      await ctx.reply(`✅ Диапазон времени фейк-выплат установлен: ${minVal}–${maxVal} сек`);
      await showFakePayoutsPanel(ctx, true);
      return;
    }

    if (pending.type === "admin_set_min_max_bet") {
      const parts = String(ctx.message.text || "").trim().split(/\s+/);
      if (parts.length !== 2) {
        setPending(ctx.from.id, pending);
        await ctx.reply("❌ Неверный формат. Используйте: 10 10000");
        return;
      }
      const minVal = parseInt(parts[0], 10);
      const maxVal = parseInt(parts[1], 10);
      const { adminService } = require("../services/admin");
      try {
        await adminService.setMinMaxBet(minVal, maxVal);
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Ошибка")}`);
        return;
      }

      const { showBetLimitsPanel } = require("../ui/screens");
      await ctx.reply("✅ Лимиты ставок обновлены");
      await showBetLimitsPanel(ctx, true);
      return;
    }

    if (pending.type === "admin_replenish_balance") {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length !== 2) {
        await ctx.reply("❌ Неверный формат. Используйте: ID сумма");
        return;
      }

      const userId = parseInt(parts[0], 10);
      const amount = parseFloat(parts[1]);

      if (isNaN(userId) || isNaN(amount) || amount <= 0) {
        await ctx.reply("❌ Неверные данные.");
        return;
      }

      const user = await prisma.users.findUnique({
        where: { tg_id: BigInt(userId) },
      });

      if (!user) {
        await ctx.reply("❌ Пользователь не найден.");
        return;
      }

      const { adminService } = require("../services/admin");
      await adminService.replenishBalance(user.id, amount);
      await ctx.reply(`✅ Баланс пользователя ${userId} пополнен на ${amount} ₽`);
      await showAdminPanel(ctx, true);
      return;
    }

    // ---- Admin: бонусы (изменение параметров) ----
    if (pending.type === "admin_bonus_set_deposit_percent") {
      const txt = ctx.message.text.trim().replace(",", ".");
      const percent = parseFloat(txt);
      const bonuses = require("../services/bonuses");

      try {
        await bonuses.adminSetDepositPercent(percent);
        await ctx.reply(`✅ Процент бонуса к депозиту обновлён: ${percent}%`);
        await showAdminPanel(ctx, true, "✅ Настройки бонуса обновлены");
      } catch (e) {
        await ctx.reply(`❌ ${e.message}`);
        await showAdminPanel(ctx, true, "❌ Ошибка");
      }
      return;
    }

    if (pending.type === "admin_bonus_set_daily_range") {
      const parts = ctx.message.text.trim().split(/\s+/);
      if (parts.length !== 2) {
        await ctx.reply("❌ Формат: min max (например: 10 5000)");
        return;
      }
      const min = parseFloat(parts[0].replace(",", "."));
      const max = parseFloat(parts[1].replace(",", "."));
      const bonuses = require("../services/bonuses");

      try {
        await bonuses.adminSetDailyRange(min, max);
        await ctx.reply(`✅ Диапазон ежедневного бонуса обновлён: ${min}–${max} ₽`);
        await showAdminPanel(ctx, true, "✅ Настройки бонуса обновлены");
      } catch (e) {
        await ctx.reply(`❌ ${e.message}`);
        await showAdminPanel(ctx, true, "❌ Ошибка");
      }
      return;
    }

    if (pending.type === "admin_bonus_broadcast_text") {
      const message = ctx.message.text.trim();
      const bonusType = pending.bonus_type;

      if (!message) {
        // allow retry
        setPending(ctx.from.id, pending);
        await ctx.reply("❌ Пустое сообщение. Отправьте текст рассылки ещё раз.");
        return;
      }

      try {
        const camp = await prisma.broadcast_campaigns.create({
          data: {
            bonus_type: bonusType,
            title: `Рассылка по бонусу ${bonusType}`,
            message: message,
            status: "QUEUED",
            created_by: null,
          },
        });

        const users = await prisma.users.findMany({
          where: { is_banned: false },
          select: { id: true },
        });

        const tasksData = users.map((u) => ({
          campaign_id: camp.id,
          user_id: u.id,
        }));

        for (let i = 0; i < tasksData.length; i += 500) {
          await prisma.broadcast_tasks.createMany({
            data: tasksData.slice(i, i + 500),
          });
        }

        await prisma.broadcast_campaigns.update({
          where: { id: camp.id },
          data: { status: "RUNNING", started_at: new Date() },
        });

        await ctx.reply(`✅ Рассылка запущена. Получателей: ${users.length}`);
        await showAdminPanel(ctx, true, "✅ Рассылка запущена");
      } catch (e) {
        console.error("broadcast error:", e);
        // allow retry without re-picking bonus
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ Ошибка рассылки: ${e.message}`);
        await showAdminPanel(ctx, true, "❌ Ошибка");
      }
      return;
    }

    // ---- topup custom ----
    if (pending.type === "topup_custom_amount") {
      const amountText = ctx.message.text.trim();
      const rawAmount = parseInt(amountText, 10);
      const rawCurrency = pending.currency || "USDT";
      const { normalizeTopupParams } = require("../services/topup");

      let amount = rawAmount;
      let currency = rawCurrency;
      try {
        const norm = normalizeTopupParams(rawAmount, rawCurrency);
        amount = norm.amountRub;
        currency = norm.currency;
      } catch (e) {
        await ctx.reply(`❌ ${e.message}`);
        return;
      }

      const { getOrCreateUser } = require("../services/users");
      const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
      const cryptoBot = require("../services/cryptobot");
      const { createDeposit } = require("../services/deposits");

      try {
        const { invoiceId, payUrl } = await cryptoBot.createInvoice(amount, { userId: user.id }, currency);
        await createDeposit(user.id, amount, invoiceId, { userId: user.id }, currency);
        await showTopupInvoice(ctx, amount, payUrl, invoiceId, currency, true);
      } catch (error) {
        console.error("Error creating invoice:", error);
        await ctx.reply("Ошибка при создании инвойса. Попробуйте позже.");
      }
      return;
    }

    

    

    // ---- support ----
    if (pending.type === "support_message") {
      const message = ctx.message.text.trim();
      if (!message) return;

      const { adminService } = require("../services/admin");
      const adminIds = await adminService.getAdminIds();

      if (!adminIds || adminIds.length === 0) {
        await ctx.reply("❌ Поддержка временно недоступна.");
        return;
      }

      const userId = ctx.from.id;
      const username = ctx.from.username || "без username";

      const text = `💬 Сообщение поддержки:\n\nОт: ${username} (ID: ${userId})\n\n${message}`;

      try {
        for (const adminId of adminIds) {
          try {
            await ctx.api.sendMessage(adminId, text);
          } catch {}
        }
        await ctx.reply("✅ Сообщение отправлено администрации. Ожидайте ответа!");
      } catch (error) {
        console.error("Error sending support message:", error);
        await ctx.reply("❌ Ошибка при отправке сообщения. Попробуйте позже.");
      }
      return;
    }

       /* -------------------- WITHDRAW FLOW -------------------- */

    if (pending.type === "withdraw_amount") {
      const raw = String(ctx.message.text || "").trim();

      // терпимо парсим: "1 500", "1500₽", "1500.50"
      let cleaned = raw.replace(/\s+/g, "").replace(/[^0-9,\.\-]/g, "");
      cleaned = cleaned.replace(/,/g, ".");
      // если несколько точек — оставляем первую
      const firstDot = cleaned.indexOf(".");
      if (firstDot !== -1) {
        cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
      }

      const amount = Number(cleaned);

      if (!Number.isFinite(amount) || amount <= 0) {
        // возвращаем pending, чтобы пользователь мог повторить ввод
        setPending(ctx.from.id, pending);
        await ctx.reply("❌ Неверная сумма. Пример: 1500");
        return;
      }

      const rounded = Math.round(amount * 100) / 100;

      // минималка — проверяем сразу, не в самом конце
      const { MIN_WITHDRAWAL } = require("../services/withdrawals");
      if (rounded < MIN_WITHDRAWAL) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ Минимальная сумма вывода: ${MIN_WITHDRAWAL} ₽`);
        return;
      }

      // next: ask for network
      setPending(ctx.from.id, {
        type: "withdraw_network",
        user_id: pending.user_id, // users.id строкой
        amount: rounded,
      });

      const kb = new InlineKeyboard()
        .text("TRC20", "withdraw:net:TRC20")
        .text("ERC20", "withdraw:net:ERC20")
        .row()
        .text("⬅️ Назад", "withdraw:start");

      await ctx.reply("🌐 Выберите сеть для USDT:", { reply_markup: kb });
      return;
    }

    if (pending.type === "withdraw_address") {
      const address = String(ctx.message.text || "").trim();
      if (!address) {
        setPending(ctx.from.id, pending);
        await ctx.reply("❌ Адрес пустой. Введите адрес кошелька.");
        return;
      }

      // validate address format now (so user can re-enter address on error)
      try {
        const { validateAddress } = require("../services/withdrawals");
        validateAddress(pending.network, address);
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Неверный адрес. Попробуйте ещё раз.")}`);
        return;
      }

      // collect comment next
      setPending(ctx.from.id, {
        type: "withdraw_comment",
        user_id: pending.user_id,
        amount: pending.amount,
        network: pending.network,
        address,
      });

      const kb = new InlineKeyboard().text("⏭ Пропустить", "withdraw:comment:skip");
      await ctx.reply("✍️ Добавьте комментарий к выводу (опционально):", { reply_markup: kb });
      return;
    }

    if (pending.type === "withdraw_comment") {
      const comment = String(ctx.message.text || "").trim();
      const amount = Number(pending.amount);
      const userId = BigInt(pending.user_id);

      try {
        const { createWithdrawal } = require("../services/withdrawals");
        const w = await createWithdrawal(userId, amount, {
          network: pending.network,
          address: pending.address,
          comment,
        });

        // Notify admins about new withdrawal request
        try {
          const { adminService } = require("../services/admin");
          const adminIds = await adminService.getAdminIds();
          if (adminIds && adminIds.length) {
            const fmt = (v) => {
              if (v && typeof v === "object" && typeof v.toFixed === "function") return v.toFixed(2);
              const n = Number(v);
              return Number.isFinite(n) ? n.toFixed(2) : String(v);
            };
            const total = (() => {
              try {
                const a = w?.amount;
                const c = w?.commission;
                if (a && typeof a === "object" && typeof a.plus === "function") return a.plus(c);
              } catch {}
              return Number(amount) + Number(w?.commission || 0);
            })();

            const username = ctx.from.username ? `@${ctx.from.username}` : "без username";
            const msg =
              `💸 Новая заявка на вывод\n` +
              `ID: ${String(w?.id ?? "")}\n` +
              `Пользователь: ${username} (tg_id: ${ctx.from.id})\n` +
              `user_id: ${String(pending.user_id)}\n` +
              `Сумма: ${fmt(w?.amount ?? amount)} ₽\n` +
              `Комиссия: ${fmt(w?.commission ?? "")} ₽\n` +
              `К списанию: ${fmt(total)} ₽\n` +
              `Сеть: ${String(pending.network)}\n` +
              `Адрес: ${String(pending.address)}\n` +
              `Комментарий: ${comment ? comment : "—"}`;

            for (const adminId of adminIds) {
              try {
                await ctx.api.sendMessage(adminId, msg);
              } catch {}
            }
          }
        } catch {}

        clearPending(ctx.from.id);
        await ctx.reply("✅ Заявка отправлена.");
      } catch (e) {
        setPending(ctx.from.id, pending);
        await ctx.reply(`❌ ${String(e?.message || "Ошибка вывода")}`);
      }

      return;
    }




  });
}

module.exports = { registerText };
