const { showRules } = require("../../ui/screens");


function registerInfoCallbacks(bot, { safeAnswer }) {
  /* -------------------- INFO -------------------- */

  bot.callbackQuery("info:channel:not_configured", async (ctx) => {
    await safeAnswer(ctx);
    await ctx.reply("⚠️ Канал ещё не настроен администратором.");
  });



  bot.callbackQuery("info:rules", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showRules(ctx);
  });

  bot.callbackQuery("rules:close", async (ctx) => {
    try {
      await ctx.deleteMessage(); // удалит именно сообщение с правилами
    } catch (e) {
      // если нет прав/уже удалено — просто игнор
    }
    await ctx.answerCallbackQuery();
  });


}

module.exports = { registerInfoCallbacks };
