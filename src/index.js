// src/index.js
const { Bot } = require("grammy");
const config = require("./config");
const { getPrisma } = require("./db/prisma");
const prisma = getPrisma();

const { registerCommands } = require("./routes/commands");
const { registerCallbacks } = require("./routes/callbacks");
const { registerText } = require("./routes/text");
const { initChannelBot } = require("./services/channel");
const { initFakeBets } = require("./services/fakeBets");
const { initFakePayouts } = require("./services/fakePayouts");
const { processDeposit } = require("./services/deposits");
// NOTE: We intentionally do NOT auto-cleanup pending invoices/withdrawals on restart.
// Pending deposits are reconciled by polling provider (see checkPendingDeposits).
const { initNotificationsWorker } = require("./services/notifications");

const bot = new Bot(config.BOT_TOKEN);

// init services that need bot instance
initChannelBot(bot);
initFakeBets();
initFakePayouts();
initNotificationsWorker(bot);

// Health-check при старте
async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Database connection OK");

  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }
}

// register handlers ONCE
registerCommands(bot);
registerCallbacks(bot);
registerText(bot);

// global error handler ONCE
bot.catch((err) => {
  console.error("Global bot error:", err);
});

bot.use(ctx => ctx.message?.photo && ctx.reply(ctx.message.photo.at(-1).file_id));


// Periodic check for pending deposits (no new prisma here!)
async function checkPendingDeposits() {
  try {
    const pendingDeposits = await prisma.deposits.findMany({
      where: { status: "PENDING", provider: "CRYPTOBOT" },
    });

    for (const deposit of pendingDeposits) {
      await processDeposit(deposit.invoice_id);
    }
  } catch (error) {
    console.error("Error checking pending deposits:", error);
  }
}

setInterval(checkPendingDeposits, 30000);

healthCheck().then(() => {
  bot.start();
  console.log("Bot started");
});

module.exports = bot;
