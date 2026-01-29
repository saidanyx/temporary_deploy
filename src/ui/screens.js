// src/ui/screens.js
const { InlineKeyboard } = require("grammy");
const { mainMenuKeyboard, gamesKeyboard } = require("./keyboards");
const { render } = require("./render");
const { MESSAGES } = require("./messages");
const IMAGES = require("../assets/images");
const { listGames } = require("../games/registry");
const { generateCaptcha } = require("../services/captcha");

function escapeMarkdown(s) {
  // Markdown (не V2): экранируем то, что ломает парсер в динамических вставках
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[");
}


/**
 * В бонусах запрещаем fallback в reply, чтобы не было дублей экранов.
 * Пытаемся отредактировать, и если не получилось — просто молчим (без отправки нового сообщения).
 */
async function renderNoDuplicate(ctx, { photo, caption, keyboard }) {
  try {
    // Если на экране была картинка — редактируем media
    if (photo) {
      const media = { type: "photo", media: photo, caption, parse_mode: "Markdown" };
      await ctx.editMessageMedia(media, { reply_markup: keyboard });
      return;
    }

    // Иначе редактируем текст
    await ctx.editMessageText(caption || "OK", {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (e) {
    // НИКАКОГО reply fallback — иначе будут дубли
  }
}

/* -------------------- MAIN -------------------- */

async function showMain(ctx, edit = true) {
  const kb = mainMenuKeyboard();
  await render(ctx, { photo: IMAGES.MAIN_MENU, caption: MESSAGES.WELCOME, keyboard: kb, edit });
}

/* -------------------- ADMIN -------------------- */

async function showAdminPanel(ctx, edit = true, notice = "") {
  const kb = new InlineKeyboard()
    .text("🎭 Фейк-ставки", "admin:fake_bets")
    .row()
    .text("🎭 Фейк-выплаты", "admin:fake_payouts")
    .row()
    .text("🎚 Лимиты ставок", "admin:bet_limits")
    .row()
    .text("📢 Каналы", "admin:channels")
    .row()
    .text("👥 Рефералы %", "admin:set_percent_referrals")
    .row()
    .text("📋 Правила", "admin:set_rules_text")
    .row()
    .text("💸 Выводы", "admin:withdrawals")
    .row()
    .text("💰 Пополнить баланс", "admin:replenish_balance")
    .row()
    .text("🎟 Промокоды", "admin:promos")
    .row()
    .text('📥 Скачать users excel', 'admin:export_users');

  const extra = notice ? `\n\n${escapeMarkdown(notice)}` : "";
  await render(ctx, {
    caption: `⚙️ *Админ панель*\n\nВыберите действие:${extra}`,
    keyboard: kb,
    edit,
  });
}

async function showBetLimitsPanel(ctx, edit = true, notice = "") {
  const { adminService } = require("../services/admin");
  const { minBet, maxBet } = await adminService.getMinMaxBet();

  const kb = new InlineKeyboard()
    .text("✏️ Изменить", "admin:bet_limits:edit")
    .row()
    .text("⬅️ Назад", "admin:panel");

  const extra = notice ? `\n\n${escapeMarkdown(notice)}` : "";
  await render(ctx, {
    caption: `🎚 *Лимиты ставок*\n\nТекущие значения:\n• Минимальная ставка: *${minBet} ₽*\n• Максимальная ставка: *${maxBet} ₽*\n\nНажмите «Изменить» и отправьте два числа через пробел (например: 10 10000).${extra}`,
    keyboard: kb,
    edit,
  });
}




/* -------------------- PROFILE -------------------- */

async function showProfile(ctx, edit = true) {
  const { getOrCreateUser } = require("../services/users");
  const { getReferralStats } = require("../services/referrals");

  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const balance = Number(user.wallets?.balance_real ?? 0);
  const balanceFormatted = balance.toFixed(2);

  const stats = await getReferralStats(user.id);

  const { adminService } = require("../services/admin");
  const refPercent = await adminService.getPercentReferrals();
  const bonusLine = `${Number(refPercent || 0).toFixed(2).replace(/\.00$/, "")}%`;

  // username бота — из контекста
  const botUsername = ctx.me?.username || ctx.botInfo?.username || null;

  // raw URL (НЕ экранируем в href)
  const refUrl = botUsername
    ? `https://t.me/${botUsername}?start=${stats.ref_link}`
    : stats.ref_link;

  // Markdown-текст: показываем кликабельной ссылкой, чтобы "_" не ломали URL
  const refLink = botUsername
    ? `[${escapeMarkdown(refUrl)}](${refUrl})`
    : escapeMarkdown(refUrl);

  const id = user.tg_id.toString();
  const registration = user.created_at.toISOString().split("T")[0];

  const kb = new InlineKeyboard()
    .text("💰 Вывести деньги", "withdraw:start")
    .row()
    .text("⬅️ Назад", "nav:main");

  await render(ctx, {
    photo: IMAGES.PROFILE,
    caption: `👤 ПРОФИЛЬ

💰 Баланс: ${balanceFormatted} ₽
🆔 ID: ${id}
📅 Регистрация: ${registration}

👥 РЕФЕРАЛЬНАЯ ПРОГРАММА
🔗 Твоя ссылка:
${refLink}
💰 Получай ${bonusLine} с проигрыша рефералов!

👤 Рефералов: ${stats.referral_count}
💰 Заработано: ${stats.total_earnings.toFixed(2)} ₽`,
    keyboard: kb,
    edit,
  });
}

/* -------------------- BONUSES (NO DUPLICATES) -------------------- */

async function showBonusesList(ctx) {
  const { getOrCreateUser } = require("../services/users");
  const { bonusesService } = require("../services/bonuses");

  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const bonuses = await bonusesService.getUserBonuses(user.id);

  const kb = new InlineKeyboard();

  // ✅ ввод промокода
  kb.text("🎟 Ввести промокод", "bonus:promo_enter").row();

  for (const b of bonuses) {
    let suffix = "";
    if (b.user_state === "ACTIVATED") suffix = " ✅";
    if (b.user_state === "UNAVAILABLE") suffix = " ⛔️";
    kb.text(`${b.name}${suffix}`, `bonus:open:${b.id}`).row();
  }
  kb.text("⬅️ Назад", "nav:main");

  await renderNoDuplicate(ctx, {
    photo: IMAGES.BONUSES,
    caption: `🎁 *Бонусы*\n\nВыберите бонус или введите промокод:`,
    keyboard: kb,
  });
}


function formatBonusStatus(details) {
  if (details.user_state === "ACTIVATED") return "Статус: Активирован ✅";
  if (details.user_state === "AVAILABLE") return "Статус: Доступен ✅";
  return `Статус: Недоступен ⛔️\nПричина: ${details.ineligibility_reason || "Не выполнены условия"}`;
}

async function showBonusDetails(ctx, bonusId, details = null, botApi = null, tgUserId = null) {
  const { getOrCreateUser } = require("../services/users");
  const { bonusesService } = require("../services/bonuses");

  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);

  // Если не передали details — подтягиваем (для daily проверка может требовать botApi)
  const data =
    details ||
    (await bonusesService.getBonusDetails(
      user.id,
      BigInt(bonusId),
      botApi || null,
      tgUserId || null
    ));

  const statusLine = formatBonusStatus(data);

  const kb = new InlineKeyboard().text("✅ Проверить условия", `bonus:check:${data.id}`).row();

  // ✅ "Активировать" — теперь и для депозитного (вариант A), и для daily
  if (data.eligible === true && data.user_state !== "ACTIVATED") {
    kb.text("🎁 Активировать", `bonus:activate:${data.id}`).row();
  }

  kb.text("⬅️ Назад", "nav:bonuses");

  const caption = `🎁 *${data.name}*\n\n${data.description}\n\n${statusLine}`;

  await renderNoDuplicate(ctx, { photo: IMAGES.PROFILE, caption, keyboard: kb });
}

async function showBonuses(ctx) {
  await showBonusesList(ctx);
}

/* -------------------- OTHER SCREENS -------------------- */

async function showReferralStats(ctx, edit = true) {
  const { getOrCreateUser } = require("../services/users");
  const { getReferralStats } = require("../services/referrals");

  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const stats = await getReferralStats(user.id);

  const { adminService } = require("../services/admin");
  const refPercent = await adminService.getPercentReferrals();
  const bonusLine = `${Number(refPercent || 0).toFixed(2).replace(/\.00$/, "")}%`;

  const botUsername = ctx.me?.username || ctx.botInfo?.username || null;

  const refUrl = botUsername
    ? `https://t.me/${botUsername}?start=${stats.ref_link}`
    : stats.ref_link;

  const refLink = botUsername
    ? `[${escapeMarkdown(refUrl)}](${refUrl})`
    : escapeMarkdown(refUrl);

  await render(ctx, {
    photo: IMAGES.PROFILE,
    caption: `👥 РЕФЕРАЛЬНАЯ ПРОГРАММА

🔗 Твоя ссылка:
${refLink}

🎁 Бонус: ${bonusLine} с проигрыша рефералов

👤 Рефералов: ${stats.referral_count}
💰 Заработано: ${Number(stats.total_earnings).toFixed(2)} ₽`,
    edit,
  });
}

async function showTimePanel(ctx, edit = true) {
  const kb = new InlineKeyboard()
    .text("Мин. время", "admin:set_min")
    .text("Макс. время", "admin:set_max")
    .row()
    .text("⬅️ Назад", "admin:back");

  await render(ctx, { photo: IMAGES.GAMES_MENU, caption: MESSAGES.TIME_PANEL, keyboard: kb, edit });
}

async function showMinPanel(ctx, edit = true) {
  const kb = new InlineKeyboard()
    .text("5 сек", "admin:min:5")
    .text("10 сек", "admin:min:10")
    .row()
    .text("15 сек", "admin:min:15")
    .text("30 сек", "admin:min:30")
    .row()
    .text("⬅️ Назад", "admin:set_time");

  await render(ctx, { photo: IMAGES.GAMES_MENU, caption: MESSAGES.MIN_TIME, keyboard: kb, edit });
}

async function showMaxPanel(ctx, edit = true) {
  const kb = new InlineKeyboard()
    .text("30 сек", "admin:max:30")
    .text("60 сек", "admin:max:60")
    .row()
    .text("120 сек", "admin:max:120")
    .text("300 сек", "admin:max:300")
    .row()
    .text("⬅️ Назад", "admin:set_time");

  await render(ctx, { photo: IMAGES.GAMES_MENU, caption: MESSAGES.MAX_TIME, keyboard: kb, edit });
}

async function showChannelsPanel(ctx, edit = true) {
  const kb = new InlineKeyboard()
    .text("✔️ Новостной канал (ссылка)", "admin:set_news_channel_url")
    .row()
    .text("🎮 Канал игр (ссылка)", "admin:set_games_channel_url")
    .row()
    .text("💰 Канал выплат (ссылка)", "admin:set_payments_channel_url")
    .row()
    .text("⬅️ Назад", "admin:back");

  await render(ctx, {
    caption:
      `📢 *Каналы*\n\n` +
      `Указываются ссылкой (например: https://t.me/your_channel или @your_channel).\n` +
      `Бот использует public @username для проверок/публикаций.`,
    keyboard: kb,
    edit,
  });
}


async function showGames(ctx, edit = true) {
  const games = listGames();
  const gameButtons = games.map((game) => ({ text: game.title, data: `game:${game.id}` }));
  const kb = gamesKeyboard(gameButtons);
  await render(ctx, { photo: IMAGES.GAMES_MENU, caption: MESSAGES.GAMES, keyboard: kb, edit });
}

async function showTopup(ctx, edit = true) {
  const currency = "USDT";
  const kb = new InlineKeyboard()
    .text("100 ₽", `topup:amount:100:${currency}`)
    .text("500 ₽", `topup:amount:500:${currency}`)
    .row()
    .text("1000 ₽", `topup:amount:1000:${currency}`)
    .text("2000 ₽", `topup:amount:2000:${currency}`)
    .row()
    .text("Другая сумма", `topup:custom:${currency}`)
    .row()
    .text("⬅️ Назад", "nav:main");

  await render(ctx, { photo: IMAGES.BET, caption: MESSAGES.TOPUP, keyboard: kb, edit });
}

async function showTopupInvoice(ctx, amount, payUrl, invoiceId, currency, edit = true) {
  const kb = new InlineKeyboard()
    .url("💳 Оплатить через CryptoBot", payUrl)
    .row()
    .text("⬅️ Назад", "nav:main");

  await render(ctx, {
    photo: IMAGES.BET,
    caption: `💰 *Пополнение баланса*\n\nСумма: *${amount} ₽*\n\nНажмите кнопку оплаты. Проверка оплаты происходит автоматически.`,
    keyboard: kb,
    edit,
  });
}

async function showCaptcha(ctx, edit = true) {
  const { word, options } = generateCaptcha(ctx.from.id);
  const kb = new InlineKeyboard();
  options.forEach((emoji) => kb.text(emoji, `captcha:${emoji}`));

  await render(ctx, {
    photo: IMAGES.CAPTCHA,
    caption: `🤖 *Проверка на бота*\n\nВыберите правильный эмодзи для слова: *${word}*`,
    keyboard: kb,
    edit,
  });
}

async function showSupport(ctx, edit = true) {
  const kb = new InlineKeyboard().text("❌ Отменить", "support:cancel");
  await render(ctx, { photo: IMAGES.SUPPORT, caption: MESSAGES.SUPPORT, keyboard: kb, edit });
}

async function showInfo(ctx, edit = true) {
  const { adminService } = require("../services/admin");
  const admin = await adminService.getAdmin();

  const newsUrl = admin?.news_channel_url || null;
  const gamesUrl = admin?.games_channel_url || null;
  const paymentsUrl = admin?.payments_channel_url || null;

  const kb = new InlineKeyboard();

  kb.text("📋 Правила", "info:rules").row();

  if (newsUrl) {
    kb.url("✔️ Новостной канал", newsUrl).row();
  } else {
    kb.text("⚠️ Новостной канал не настроен", "info:channel:not_configured").row();
  }

  if (gamesUrl) {
    kb.url("🎮 Канал игр", gamesUrl).row();
  } else {
    kb.text("⚠️ Канал игр не настроен", "info:channel:not_configured").row();
  }

  if (paymentsUrl) {
    kb.url("💰 Канал выплат", paymentsUrl).row();
  } else {
    kb.text("⚠️ Канал выплат не настроен", "info:channel:not_configured").row();
  }

  kb.text("⬅️ Назад", "nav:main");

  await render(ctx, {
    photo: IMAGES.INFO,
    caption: "ℹ️ *Информация*\n\nВыберите раздел:",
    keyboard: kb,
    edit,
  });
}

async function showRules(ctx, edit = true) {
  const defaultRules =
    "🎰 *Общие правила Vegas Vibe*\n\n" +
    "✅ *Принятие правил*\n" +
    "• Используя бота, вы автоматически соглашаетесь с правилами.\n" +
    "• Администрация может изменять правила — о значимых изменениях сообщим в боте.\n" +
    "• Вы отвечаете за соблюдение законов вашей страны об азартных играх.\n\n" +
    "💰 *Финансовые операции*\n" +
    "*Пополнение счёта*\n" +
    "• Депозит — через встроенные платёжные системы.\n" +
    "• Средства зачисляются автоматически. При сбоях — обратитесь в поддержку.\n\n" +
    "💸 *Вывод средств*\n" +
    "• Необходимо отыграть 100% от суммы депозита.\n" +
    "• Отыгрышем не считаются: ничья в BlackJack, игра «Кубик» (PVE) и коэффициенты ниже 1.03x.\n" +
    "• Администрация вправе запросить верификацию для предотвращения мошенничества.\n" +
    "• Вывод возможен только на реквизиты, с которых делалось пополнение.\n" +
    "• В выводе может быть отказано при обнаружении нарушений.\n\n" +
    "🎮 *Правила игр*\n" +
    "*Честность и случайность*\n" +
    "• Все игры используют ГСЧ — результат случаен и честен.\n" +
    "• Результат генерируется в начале игры и не может быть изменён.\n\n" +
    "👤 *Ответственность игрока*\n" +
    "• Вы осознаёте риск потери средств при ставке.\n" +
    "• Все ставки окончательны — отмена игры невозможна.\n\n" +
    "🤳🏼 *Технические сбои*\n" +
    "• При сбое в процессе игры ставка возвращается на счёт.\n" +
    "• Если результат был определён до сбоя — он сохраняется.\n\n" +
    "⚠️ *Запреты и ограничения*\n" +
    "• Запрещены мультиаккаунты для бонусов, абуза рефералов, обход ограничений.\n" +
    "• Запрещено использование багов, скриптов, читов и любого мошенничества.\n" +
    "• Запрещены попытки обмана администрации или игроков.\n" +
    "• Запрещена передача аккаунта третьим лицам.\n\n" +
    "🔒 *Безопасность и конфиденциальность*\n" +
    "• Ваши персональные и платёжные данные защищены.\n" +
    "• Вы отвечаете за безопасность Telegram-аккаунта и доступ к боту.\n" +
    "• При блокировке аккаунта Telegram баланс в боте не возвращается.\n\n" +
    "❗️ Нарушения ведут к перманентной блокировке всех аккаунтов без возврата средств.\n\n" +
    "❓ *Поддержка*\n" +
    "По всем вопросам — через раздел «Поддержка» в боте.\n\n" +
    "Желаем вам удачи! 🍀";

  // Admin-configurable override (Markdown)
  let rules = defaultRules;
  try {
    const { adminService } = require("../services/admin");
    const custom = (await adminService.getRulesText()) || "";
    if (custom.trim()) rules = custom;
  } catch {
    // ignore
  }

  const kb = new InlineKeyboard().text("⬅️ Назад", "rules:close");

  // Важно: reply, а не render()
  await ctx.reply(rules, {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

async function showWithdraw(ctx, edit = true) {
  const { getOrCreateUser } = require("../services/users");
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const balance = Number(user.wallets?.balance_real ?? 0);

  const kb = new InlineKeyboard().text("⬅️ Назад", "nav:profile");

  await render(ctx, {
    caption:
      `Введите сумму вывода в ₽ (например: *1500*)\n\nДоступно: *${balance.toFixed(2)} ₽*`,
    keyboard: kb,
    edit,
  });
}




async function showWithdrawConfirm(ctx, amount, edit = true) {
  const { COMMISSION_PERCENT } = require("../services/withdrawals");
  const commission = (amount * COMMISSION_PERCENT) / 100;
  const total = amount + commission;

  const kb = new InlineKeyboard()
    .text("✅ Подтвердить", `withdraw:confirm:${amount}`)
    .row()
    .text("⬅️ Назад", "withdraw:start");

  const message = MESSAGES.WITHDRAW_CONFIRM.replace("%AMOUNT%", amount)
    .replace("%COMMISSION%", commission.toFixed(2))
    .replace("%TOTAL%", total.toFixed(2));

  await render(ctx, { photo: IMAGES.MAIN_MENU, caption: message, keyboard: kb, edit });
}

async function showFakeBetsPanel(ctx, edit = true, notice = "") {
  const { service } = require("../services/fakeBets");
  const cfg = await service.getConfig();
  const status = cfg.enabled ? "ON" : "OFF";

  const kb = new InlineKeyboard()
    .text(`🔁 Фейк-ставки: ${status}`, "admin:fake_bets:toggle")
    .row()
    .text(`⏰ Установить время (${cfg.min_sec}-${cfg.max_sec})`, "admin:fake_bets:set_time_direct")
    .row()
    .text("⬅️ Назад", "admin:back");

  const extra = notice ? `\n\n${escapeMarkdown(notice)}` : "";
  await render(ctx, {
    caption: `🎭 *Фейк-ставки*\n\nСтатус: ${status}\nДиапазон времени: ${cfg.min_sec}–${cfg.max_sec} сек${extra}`,
    keyboard: kb,
    edit,
  });
}

async function showFakePayoutsPanel(ctx, edit = true, notice = "") {
  const { service } = require("../services/fakePayouts");
  const cfg = await service.getConfig();
  const status = cfg.enabled ? "ON" : "OFF";

  const kb = new InlineKeyboard()
    .text(`🔁 Фейк-выплаты: ${status}`, "admin:fake_payouts:toggle")
    .row()
    .text(`⏰ Установить время (${cfg.min_sec}-${cfg.max_sec})`, "admin:fake_payouts:set_time_direct")
    .row()
    .text("⬅️ Назад", "admin:back");

  const extra = notice ? `\n\n${escapeMarkdown(notice)}` : "";
  await render(ctx, {
    caption: `🎭 *Фейк-выплаты*\n\nСтатус: ${status}\nДиапазон времени: ${cfg.min_sec}–${cfg.max_sec} сек${extra}`,
    keyboard: kb,
    edit,
  });
}

module.exports = {
  showMain,
  showGames,
  showAdminPanel,
  showBetLimitsPanel,
  showTimePanel,
  showMinPanel,
  showMaxPanel,
  showProfile,

  // bonuses (no duplicates)
  showBonuses,
  showBonusesList,
  showBonusDetails,

  showReferralStats,
  showChannelsPanel,
  showTopup,
  showTopupInvoice,
  showCaptcha,
  showSupport,
  showInfo,
  showRules,
  showWithdraw,
  showWithdrawConfirm,
  showFakeBetsPanel,
  showFakePayoutsPanel,
};