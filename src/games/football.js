const IMAGES = require("../assets/images");
const { buildDiceMiniGame } = require("./diceMiniBase");

module.exports = buildDiceMiniGame({
  id: "football",
  gameName: "Футбол",
  gameId: "football",
  photo: IMAGES.FOOTBALL,
  emoji: "⚽",
  rulesText:
    "⚽ *ФУТБОЛ* ⚽\n\n" +
    "*Правила игры:*\n" +
    "• Бьешь по воротам\n" +
    "• Результат от 1 до 5\n\n" +
    "*Выплаты:*\n" +
    "• 3-5 — ГОЛ! → x1.5 🔥\n" +
    "• 1-2 — Мимо → проигрыш\n\n" +
    "Простая игра — забил или нет!",
  payoutFn: (v) => (v >= 3 ? 1.5 : 0),
});
