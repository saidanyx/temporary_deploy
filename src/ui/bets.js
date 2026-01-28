const { InlineKeyboard } = require("grammy");

function betsKeyboard(gameId) {
  return new InlineKeyboard()
    .text("100 ₽", `g:${gameId}:bet:100`)
    .text("300 ₽", `g:${gameId}:bet:300`)
    .text("500 ₽", `g:${gameId}:bet:500`)
    .row()
    .text("✏️ Своя ставка", `g:${gameId}:bet:custom`)
    .row()
    .text("⬅️ Назад", `nav:games`);
}

module.exports = { betsKeyboard };
