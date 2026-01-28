// src/routes/callbacks/games.js
const dice = require("../../games/dice");
const mines = require("../../games/mines");
const blackjack = require("../../games/blackjack");
const rocket = require("../../games/rocket");

const slots = require("../../games/slots");
const bowling = require("../../games/bowling");
const basketball = require("../../games/basketball");
const darts = require("../../games/darts");
const football = require("../../games/football");

const rps = require("../../games/rps");
const wheel = require("../../games/wheel");
const boxes = require("../../games/boxes");

const games = { dice, mines, blackjack, rocket, slots, bowling, basketball, darts, football, rps, wheel, boxes };

function registerGameCallbacks(bot, { safeAnswer }) {
  /* -------------------- GAMES -------------------- */

  bot.callbackQuery(/^g:([^:]+):([^:]+):(.+)$/, async (ctx) => {
    await safeAnswer(ctx);

    const gameId = ctx.match[1];
    const cmd = ctx.match[2];
    const value = ctx.match[3];

    const g = games[gameId];
    if (!g) return;

    if (cmd === "bet") return g.onCallback(ctx, `bet:${value}`);
    if (cmd === "open") return g.open(ctx);

    if (cmd === "play") {
      if (typeof g.showBets === "function") return g.showBets(ctx);
      return g.onCallback(ctx, "play");
    }
  });

  bot.callbackQuery(/^game:([^:]+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const id = ctx.match[1];
    const g = games[id];
    if (!g) return;
    await g.open(ctx);
  });

  bot.callbackQuery(/^play:([^:]+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const id = ctx.match[1];
    const g = games[id];
    if (!g) return;
    if (typeof g.showBets === "function") return g.showBets(ctx);
    return g.onCallback(ctx, "play");
  });

  bot.callbackQuery(/^bet:([^:]+):(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    const id = ctx.match[1];
    const amount = ctx.match[2];
    const g = games[id];
    if (!g) return;
    await g.onCallback(ctx, `bet:${amount}`);
  });

  // Legacy per-game routes (keep strings/regex as-is)
  bot.callbackQuery(/^slots:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await slots.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^bowling:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await bowling.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^basketball:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await basketball.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^darts:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await darts.onCallback(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^dice:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await dice.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^mines:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await mines.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^blackjack:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await blackjack.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^rocket:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await rocket.onCallback(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^rps:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await rps.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^wheel:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await wheel.onCallback(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^boxes:(.+)$/, async (ctx) => {
    await safeAnswer(ctx);
    await boxes.onCallback(ctx, ctx.match[1]);
  });
}

module.exports = { registerGameCallbacks };
