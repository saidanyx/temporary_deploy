const IMAGES = require("../assets/images");
const { buildDiceMiniGame } = require("./diceMiniBase");

module.exports = buildDiceMiniGame({
  id: "slots",
  gameName: "Слоты",
  gameId: "slots",
  photo: IMAGES.SLOTS,
  emoji: "🎰",
  rulesText:
    "🎰 *СЛОТЫ* 🎰\n\n" +
    "*Правила игры:*\n" +
    "• Крутится барабан с символами\n" +
    "• Нужно собрать комбинацию из 3 символов\n\n" +
    "*Выигрышные комбинации:*\n" +
    "• 7️⃣ 7️⃣ 7️⃣ → x15 💥 ДЖЕКПОТ\n" +
    "• 🍒 🍒 🍒 → x2 ✨\n" +
    "• 🍋 🍋 🍋 → x2 ✨\n" +
    "• ⭐ ⭐ ⭐ → x2 ✨\n" +
    "• Два одинаковых → x1.1 🪃\n\n" +
    "Используется встроенный 🎰 *Telegram Dice!*",
  payoutFn: (v) => {
    if (v === 64) return 15;
    if (v % 16 === 0) return 2;
    if (v % 8 === 0) return 1.1;
    return 0;
  },
});
