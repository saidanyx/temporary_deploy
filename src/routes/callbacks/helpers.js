// src/routes/callbacks/helpers.js

async function safeAnswer(ctx) {
  try {
    await ctx.answerCallbackQuery();
  } catch {}
}

async function isAdmin(ctx) {
  // ctx.from can be missing for channel_post updates
  if (!ctx?.from?.id) return false;
  const { adminService } = require("../../services/admin");
  const adminIds = await adminService.getAdminIds();
  return Array.isArray(adminIds) && adminIds.includes(ctx.from.id);
}

module.exports = { safeAnswer, isAdmin };
