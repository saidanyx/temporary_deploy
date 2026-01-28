const { InlineKeyboard } = require("grammy");
const { MESSAGES } = require("./messages");

/**
 * Creates a back button keyboard with specified callback.
 * @param {string} callback - The callback data for the back button.
 * @returns {InlineKeyboard} - The keyboard with back button.
 */
function backKeyboard(callback) {
  return new InlineKeyboard().text("⬅️ Назад", callback);
}

/**
 * Sends insufficient funds message with optional back keyboard.
 * @param {Object} ctx - Telegram context.
 * @param {InlineKeyboard} [backKb] - Optional back keyboard.
 */
async function insufficientFunds(ctx, backKb = null) {
  const replyMarkup = backKb ? { reply_markup: backKb } : {};
  await ctx.reply(MESSAGES.INSUFFICIENT_BALANCE, replyMarkup);
}

/**
 * Creates a back button keyboard for a specific game.
 * @param {string} gameId - The game ID for the back callback.
 * @returns {InlineKeyboard} - The keyboard with back button.
 */
function gameBackKeyboard(gameId) {
  return new InlineKeyboard().text("⬅️ Назад", `game:${gameId}`);
}

/**
 * Sends game result reply with details and back keyboard.
 * @param {Object} ctx - Telegram context.
 * @param {string} type - Type of result: 'win', 'loss', 'draw', 'exact_hit', 'missed', 'tie_return'.
 * @param {string} details - Additional details for the message.
 * @param {InlineKeyboard} backKb - Back keyboard.
 */
async function gameResultReply(ctx, type, details, backKb) {
  let message;
  switch (type) {
    case 'win':
      message = `${MESSAGES.WIN}\n${details}`;
      break;
    case 'loss':
      message = `${MESSAGES.LOSS}\n${details}`;
      break;
    case 'draw':
      message = `${MESSAGES.DRAW}\n${details}`;
      break;
    case 'exact_hit':
      message = `${MESSAGES.EXACT_HIT}\n${details}`;
      break;
    case 'missed':
      message = `${MESSAGES.MISSED}\n${details}`;
      break;
    case 'tie_return':
      message = `${MESSAGES.TIE_RETURN}\n${details}`;
      break;
    default:
      message = details;
  }

  await ctx.reply(message, { parse_mode: "Markdown", reply_markup: backKb });
}

/**
 * Creates a play in bot keyboard with play button and back button.
 * @param {string} playCallback - The callback data for the play button.
 * @returns {InlineKeyboard} - The keyboard with play and back buttons.
 */
function playInBotKeyboard(playCallback) {
  // Unified wording across all mini-games
  return new InlineKeyboard().text("🎮 Играть в боте", playCallback);
}

module.exports = {
  backKeyboard,
  insufficientFunds,
  gameBackKeyboard,
  gameResultReply,
  playInBotKeyboard,
};
