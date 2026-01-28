const { InlineKeyboard } = require("grammy");

const cb = {
  menuGames: "nav:games",
  menuBack: "nav:main",
};

function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("🎮 Игры в боте", cb.menuGames)
    .row()
    .text("👤 Профиль", "nav:profile")
    .text("💬 Поддержка", "nav:support")
    .row()
    .text("💰 Пополнить", "nav:deposit")
    .row()
    .text("🎁 Бонусы", "nav:bonuses")
    .text("ℹ️ Информация", "nav:info");
}

function gamesKeyboard(gameButtons) {
  const kb = new InlineKeyboard();

  // по 2 в ряд
  for (let i = 0; i < gameButtons.length; i += 2) {
    kb.text(gameButtons[i].text, gameButtons[i].data);
    if (gameButtons[i + 1]) kb.text(gameButtons[i + 1].text, gameButtons[i + 1].data);
    kb.row();
  }

  kb.text("⬅️ Назад", cb.menuBack);
  return kb;
}

module.exports = {
  cb,
  mainMenuKeyboard,
  gamesKeyboard,
};
