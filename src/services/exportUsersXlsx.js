"use strict";

const ExcelJS = require("exceljs");
const { InputFile } = require("grammy");
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

function asText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v;
  return v;
}

async function exportUsersXlsx(ctx) {
  // Берём только нужные поля из model users (без отношений)
  const users = await prisma.users.findMany({
    select: {
      id: true,
      tg_id: true,
      username: true,
      first_name: true,
      created_at: true,
      is_banned: true,
      is_admin: true,
      captcha_passed: true,
      referrer_id: true,
      ref_code: true,
      ref_mode: true,
      // намеренно НЕ тащу ref_fix_amount / ref_percent — слишком “техническое” для просмотра глазами
      // если хочешь — скажи, добавлю колонками
    },
    orderBy: { created_at: "desc" },
  });

  if (!users.length) {
    await ctx.answerCallbackQuery("Таблица users пуста");
    return;
  }

  // Сводка
  let banned = 0, admins = 0, captcha = 0, withReferrer = 0;
  for (const u of users) {
    if (u.is_banned) banned++;
    if (u.is_admin) admins++;
    if (u.captcha_passed) captcha++;
    if (u.referrer_id) withReferrer++;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Bot";
  const ws = wb.addWorksheet("Users", { views: [{ state: "frozen", ySplit: 6 }] });

  // Заголовок
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = "📊 Пользователи (users)";
  ws.getCell("A1").font = { size: 16, bold: true };
  ws.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };

  ws.addRow([]);
  ws.addRow(["Всего:", users.length, "", "Админы:", admins, "", "Забанены:", banned]);
  ws.addRow(["Captcha пройдена:", captcha, "", "С реферером:", withReferrer, "", "Выгрузка:", new Date()]);
  ws.getRow(4).getCell(8).numFmt = "dd.mm.yyyy hh:mm";

  ws.addRow([]);

  // Колонки (русские заголовки, но поля “родные”)
  ws.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "TG ID", key: "tg_id", width: 16 },
    { header: "Username", key: "username", width: 20 },
    { header: "Имя", key: "first_name", width: 18 },
    { header: "Дата регистрации", key: "created_at", width: 19 },
    { header: "Админ", key: "is_admin", width: 10 },
    { header: "Бан", key: "is_banned", width: 10 },
    { header: "Captcha", key: "captcha_passed", width: 10 },
    { header: "Referrer ID", key: "referrer_id", width: 14 },
    { header: "Реф. код", key: "ref_code", width: 16 },
    { header: "Реф. режим", key: "ref_mode", width: 12 },
  ];

  const headerRow = ws.addRow(ws.columns.map(c => c.header));
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };

  // Данные
  for (const u of users) {
    const row = ws.addRow({
      id: asText(u.id),
      tg_id: asText(u.tg_id),
      username: u.username ? `@${u.username}` : "",
      first_name: u.first_name || "",
      created_at: asText(u.created_at),
      is_admin: u.is_admin ? "✅" : "",
      is_banned: u.is_banned ? "⛔" : "",
      captcha_passed: u.captcha_passed ? "✅" : "",
      referrer_id: asText(u.referrer_id),
      ref_code: u.ref_code || "",
      ref_mode: u.ref_mode || "",
    });

    row.getCell("created_at").numFmt = "dd.mm.yyyy hh:mm";
    row.alignment = { vertical: "middle" };
  }

  // Лёгкая “табличность”
  ws.eachRow((row, idx) => {
    if (idx >= headerRow.number) {
      row.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
      };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `users_${new Date().toISOString().slice(0, 10)}.xlsx`;

  await ctx.replyWithDocument(
    new InputFile(Buffer.from(buffer), fileName),
    { caption: `📊 Users: ${users.length} записей` }
  );
}

module.exports = { exportUsersXlsx };
