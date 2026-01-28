// src/routes/callbacks/payments.js
const { showTopup, showTopupInvoice, showWithdraw } = require("../../ui/screens");
const { setPending, getPending, clearPending } = require("../../state/session");
const { normalizeTopupParams } = require("../../services/topup");

function registerPaymentsCallbacks(bot, { safeAnswer }) {
  bot.callbackQuery("nav:deposit", async (ctx) => {
    await safeAnswer(ctx);
    await showTopup(ctx, true);
  });

  bot.callbackQuery(/^topup:amount:(\d+):([^:]+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const rawAmount = Number(ctx.match[1]);
    const rawCurrency = ctx.match[2];

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

    const { getOrCreateUser } = require("../../services/users");
    const cryptoBot = require("../../services/cryptobot");
    const { createDeposit } = require("../../services/deposits");
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);

    try {
      const { invoiceId, payUrl } = await cryptoBot.createInvoice(amount, { userId: user.id }, currency);
      await createDeposit(user.id, amount, invoiceId, { userId: user.id }, currency);
      await showTopupInvoice(ctx, amount, payUrl, invoiceId, currency, true);
    } catch (error) {
      console.error("Error creating invoice:", error);
      await ctx.reply("Ошибка при создании инвойса. Попробуйте позже.");
    }
  });

  bot.callbackQuery(/^topup:custom:([^:]+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const rawCurrency = ctx.match[1];
    try {
      // validate currency only
      normalizeTopupParams(1, rawCurrency);
    } catch (e) {
      await ctx.reply(`❌ ${e.message}`);
      return;
    }
    const currency = "USDT";
    await ctx.reply("Введите сумму пополнения (максимум 10000 ₽):");
    setPending(ctx.from.id, { type: "topup_custom_amount", currency });
  });

  /* -------------------- WITHDRAW -------------------- */

  bot.callbackQuery("withdraw:start", async (ctx) => {
    await safeAnswer(ctx);

    const { getOrCreateUser } = require("../../services/users");
    const user = await getOrCreateUser(ctx.from.id, ctx.from.username);

    // ждём сумму, храним реальный users.id
    setPending(ctx.from.id, { type: "withdraw_amount", user_id: String(user.id) });

    // показываем экран "Введите сумму"
    await showWithdraw(ctx, true);
  });

  // Network selection
  bot.callbackQuery(/^withdraw:net:(TRC20|ERC20)$/, async (ctx) => {
    await safeAnswer(ctx);

    const pending = getPending(ctx.from.id);
    if (!pending || pending.type !== "withdraw_network") {
      // user clicked stale button; restart flow
      return showWithdraw(ctx, true);
    }

    const network = ctx.match[1];
    setPending(ctx.from.id, {
      type: "withdraw_address",
      user_id: pending.user_id,
      amount: pending.amount,
      network,
    });

    const hint = network === "TRC20" ? "пример: T..." : "пример: 0x...";
    await ctx.reply(`🔐 Введите адрес для вывода (${network}) — ${hint}`);
  });

  // Comment skip
  bot.callbackQuery("withdraw:comment:skip", async (ctx) => {
    await safeAnswer(ctx);

    const pending = getPending(ctx.from.id);
    if (!pending || pending.type !== "withdraw_comment") {
      return;
    }

    try {
      const { createWithdrawal } = require("../../services/withdrawals");
      const w = await createWithdrawal(BigInt(pending.user_id), Number(pending.amount), {
        network: pending.network,
        address: pending.address,
        comment: "",
      });

      // Notify admins about new withdrawal request
      try {
        const { adminService } = require("../../services/admin");
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
            return Number(pending.amount) + Number(w?.commission || 0);
          })();

          const username = ctx.from.username ? `@${ctx.from.username}` : "без username";
          const msg =
            `💸 Новая заявка на вывод\n` +
            `ID: ${String(w?.id ?? "")}\n` +
            `Пользователь: ${username} (tg_id: ${ctx.from.id})\n` +
            `user_id: ${String(pending.user_id)}\n` +
            `Сумма: ${fmt(w?.amount ?? pending.amount)} ₽\n` +
            `Комиссия: ${fmt(w?.commission ?? "")} ₽\n` +
            `К списанию: ${fmt(total)} ₽\n` +
            `Сеть: ${String(pending.network)}\n` +
            `Адрес: ${String(pending.address)}\n` +
            `Комментарий: —`;

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
      // keep pending so user can retry
      setPending(ctx.from.id, pending);
      await ctx.reply(`❌ ${String(e?.message || "Ошибка вывода")}`);
    }
  });
}

module.exports = { registerPaymentsCallbacks };
