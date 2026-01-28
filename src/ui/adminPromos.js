// src/ui/adminPromos.js
const { InlineKeyboard } = require("grammy");
const { render } = require("./render");

async function showPromoAdmin(ctx, edit = true, notice = "") {
  const kb = new InlineKeyboard()
    .text("➕ Создать промокод", "admin:promo:create")
    .row()
    .text("⬅️ Назад", "admin:back");

  const extra = notice ? `\n\n${notice}` : "";
  await render(ctx, {
    caption: `🎟 *Промокоды к депозиту*\n\nВыберите действие:${extra}`,
    keyboard: kb,
    edit,
  });
}

async function showPromoCreateStep(ctx, stepText, edit = true) {
  const kb = new InlineKeyboard().text("❌ Отменить", "admin:promo:cancel");
  await render(ctx, {
    caption: `🎟 *Создание промокода*\n\n${stepText}`,
    keyboard: kb,
    edit,
  });
}

async function showPromoConfirm(ctx, data, edit = true) {
  const kb = new InlineKeyboard()
    .text("✅ Создать и разослать", "admin:promo:confirm")
    .row()
    .text("❌ Отменить", "admin:promo:cancel");

  await render(ctx, {
    caption:
      `🎟 *Подтверждение*\n\n` +
      `Название: *${data.name}*\n` +
      `Код: *${data.code}*\n` +
      `Процент: *${data.percent}%*\n\n` +
      `*Текст рассылки:*\n${data.message}\n\n` +
      `После создания будет рассылка всем пользователям.`,
    keyboard: kb,
    edit,
  });
}

module.exports = { showPromoAdmin, showPromoCreateStep, showPromoConfirm };
