// src/ui/adminWithdrawals.js
const { InlineKeyboard } = require("grammy");
const { render } = require("./render");
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const IMAGES = require("../assets/images");

function fmtDate(d) {
  try {
    return new Date(d).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return String(d);
  }
}

async function showAdminWithdrawalsList(ctx, edit = true, offset = 0) {
  console.log("[ADMIN WITHDRAWALS LIST] open offset=", offset);

  const take = 10;

  // ✅ показываем только заявки на одобрение
  const rows = await prisma.withdrawals.findMany({
    where: { status: "PENDING" },
    orderBy: { created_at: "desc" },
    skip: offset,
    take,
    include: { user: true },
  });

  const total = await prisma.withdrawals.count({
    where: { status: "PENDING" },
  });

  console.log("[ADMIN WITHDRAWALS LIST] ids=", rows.map((r) => r.id.toString()));

  const kb = new InlineKeyboard();

  if (!rows.length) {
    kb.text("🔄 Обновить", "admin:withdrawals").row().text("⬅️ Назад", "admin:back");

    await render(ctx, {
      photo: IMAGES.MAIN_MENU,
      caption: `💸 *Заявки на вывод (ожидают одобрения)*\n\nЗаявок нет.`,
      keyboard: kb,
      edit,
      parseMode: null,
    });
    return;
  }

  // Текст + кнопки "одобрить/отклонить" на каждую заявку
  const lines = [];

  // номер в списке #1/#2/#3... (как ты просил)
  let i = 1 + offset;

  for (const w of rows) {
    const amt = Number(w.amount).toFixed(2);
    const comm = Number(w.commission).toFixed(2);
    const uname = w.user?.username ? `@${w.user.username}` : `user:${w.user_id}`;

    const network = w.network || "?";
    const addr = (w.address || "").trim() || "(нет адреса)";
    const comment = (w.comment || "").trim();

    lines.push(
      `#${i} — ${amt} ₽ (ком ${comm} ₽) — ${uname} — ${fmtDate(w.created_at)}\n` +
        `🌐 ${network} • 📮 ${addr}` +
        (comment ? `\n📝 ${comment}` : "")
    );

    // ✅ кнопки на каждую строку
    kb
      // callback_data preserved for backward compatibility
      .text(`✅ Выплачено #${i}`, `admin:withdrawals:approve:${w.id}`)
      .text(`❌ Отклонить #${i}`, `admin:withdrawals:reject:${w.id}`)
      .row();

    i += 1;
  }

  // ✅ пагинация + сервисные кнопки
  const prevOffset = Math.max(0, offset - take);
  const nextOffset = offset + take;

  // показываем стрелки только если есть куда
  if (offset > 0) kb.text("⬅️", `admin:withdrawals:page:${prevOffset}`);
  if (nextOffset < total) kb.text("➡️", `admin:withdrawals:page:${nextOffset}`);
  if (offset > 0 || nextOffset < total) kb.row();

  kb.text("🔄 Обновить", "admin:withdrawals").row().text("⬅️ Назад", "admin:back");

  await render(ctx, {
    photo: IMAGES.MAIN_MENU,
    caption:
      `💸 *Заявки на вывод (ожидают одобрения)*\n` +
      `Всего: *${total}* • Показано: *${rows.length}*\n\n` +
      lines.join("\n"),
    keyboard: kb,
    edit,
    parseMode: null,
  });
}

module.exports = { showAdminWithdrawalsList };
