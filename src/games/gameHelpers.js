const { publishGameEventToChannel } = require("../services/channel");

/**
 * Publishes game result event to channel.
 * @param {Object} user - User object.
 * @param {number} bet - Bet amount.
 * @param {string} resultSummary - Summary of the result.
 * @param {number} mult - Multiplier.
 * @param {number} payout - Payout amount.
 * @param {number} newBalance - New balance.
 * @param {boolean} isDemo - Is demo mode.
 * @param {boolean} isDraw - Is draw.
 * @param {boolean} isRefund - Is refund.
 * @param {string} gameName - Name of the game.
 * @param {string} gameId - ID of the game.
 * @param {Object} ctx - Telegram context.
 */
async function publishGameResult(user, bet, resultSummary, mult, payout, newBalance, isDemo, isDraw, isRefund, gameName, gameId, ctx) {
  await publishGameEventToChannel("result", {
    gameName,
    gameId,
    username: user.username,
    tgId: ctx.from.id,
    bet,
    resultSummary,
    mult,
    payout,
    newBalance,
    isDemo,
    isDraw,
    isRefund,
  });
}

module.exports = {
  publishGameResult,
};
