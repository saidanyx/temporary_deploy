// src/routes/callbacks/index.js
const { safeAnswer, isAdmin } = require("./helpers");

const { registerNavCallbacks } = require("./nav");
const { registerGameCallbacks } = require("./games");
const { registerAdminCallbacks } = require("./admin");
const { registerPaymentsCallbacks } = require("./payments");
const { registerInfoCallbacks } = require("./info");

function registerCallbacks(bot) {
  registerNavCallbacks(bot, { safeAnswer });
  registerGameCallbacks(bot, { safeAnswer });
  registerPaymentsCallbacks(bot, { safeAnswer });
  registerAdminCallbacks(bot, { safeAnswer, isAdmin });
  registerInfoCallbacks(bot, { safeAnswer });
}

module.exports = { registerCallbacks };
