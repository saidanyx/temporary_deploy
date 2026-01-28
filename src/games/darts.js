// src/games/darts.js
// Dice-based mini-game built on the shared engine
const IMAGES = require("../assets/images");
const { buildDiceMiniGame } = require("./diceMiniBase");

module.exports = buildDiceMiniGame({
  id: "darts",
  gameName: "🎯 Дартс",
  gameId: "darts",
  photo: IMAGES.DARTS,
  emoji: "🎯",
  // Use global bet limits from admin.min_max_bet
  betCooldownMs: 5000,
  rulesText:
    "🎯 *ДАРТС* 🎯\n\n" +
    "*Правила игры:*\n" +
    "• Бросаешь дротик в мишень\n" +
    "• Результат от 1 до 6\n\n" +
    "*Выплаты:*\n" +
    "• 6 — ЯБЛОЧКО! → x2.56 🔥\n" +
    "• 5 — Близко к центру → x1.42 ✨\n" +
    "• 4 — Хорошо → x0.95 ✅\n" +
    "• 3 — Средне → x0.47 🪃\n" +
    "• 1-2 — Промах → проигрыш\n\n" +
    "Используется встроенный 🎯 *Telegram Dice!*",
  payoutFn: (v) => ({ 6: 2.56, 5: 1.42, 4: 0.95, 3: 0.47 }[v] || 0),
  resultSummaryFn: (v) => `🎯 ${v}`,
});
