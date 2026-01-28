const IMAGES = require("../assets/images");
const { buildDiceMiniGame } = require("./diceMiniBase");

module.exports = buildDiceMiniGame({
  id: "basketball",
  gameName: "Баскетбол",
  gameId: "basketball",
  photo: IMAGES.BASKETBALL,
  emoji: "🏀",
  rulesText:
    "🏀 *БАСКЕТБОЛ* 🏀\n\n" +
    "*Правила игры:*\n" +
    "• Бросаешь мяч в кольцо\n" +
    "• Результат от 1 до 5\n\n" +
    "*Выплаты:*\n" +
    "• 5 — ДАНК! → x2.37 🔥\n" +
    "• 4 — Попадание → x1.66 ✨\n" +
    "• 3 — Коснулся кольца → x0.47 🪃\n" +
    "• 1-2 — Мимо → проигрыш\n\n" +
    "Используется встроенный 🏀 *Telegram Dice!*",
  payoutFn: (v) => ({ 5: 2.37, 4: 1.66, 3: 0.47 }[v] || 0),
});
