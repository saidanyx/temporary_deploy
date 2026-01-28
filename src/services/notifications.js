"use strict";

// src/services/notifications.js
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

let botRef = null;
let started = false;

const OUTBOX_BATCH = 25;
const BROADCAST_BATCH = 25;
const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeSendMessage(userTgId, text, opts = {}) {
  if (!botRef) return { ok: false, error: "bot_not_initialized" };
  try {
    await botRef.api.sendMessage(userTgId, text, { parse_mode: "Markdown", ...opts });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "send_failed" };
  }
}

function formatOutboxMessage(row) {
  const payload = row.payload || {};

  if (row.type === "BONUS_DAILY_CLAIMED") {
    return `🎁 Вам начислен ежедневный бонус: *${Number(payload.amount).toFixed(2)} ₽*`;
  }

  if (row.type === "BONUS_DEPOSIT_AWARDED") {
    return `🎁 Вам начислен бонус к депозиту: *${Number(payload.amount).toFixed(2)} ₽*`;
  }

  if (row.type === "ADMIN_BROADCAST") {
    const msg = String(payload.message || payload.text || "").trim();
    return msg || "🔔 Уведомление";
  }

  return `🔔 Уведомление`;
}

async function processOutboxBatch() {
  // Prisma client может быть не сгенерен под новую схему — не падаем
  if (!prisma.notifications_outbox) {
    console.warn("[notifications] prisma.notifications_outbox is undefined (did you run prisma generate?)");
    return;
  }

  const batch = await prisma.notifications_outbox.findMany({
    where: { status: "PENDING", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { created_at: "asc" },
    take: OUTBOX_BATCH,
    include: { user: true },
  });

  if (!batch.length) return;

  for (const row of batch) {
    try {
      const tgId = row.user?.tg_id ? Number(row.user.tg_id) : null;
      if (!tgId) {
        await prisma.notifications_outbox.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            attempts: row.attempts + 1,
            sent_at: new Date(),
          },
        });
        continue;
      }

      const text = formatOutboxMessage(row);
      const res = await safeSendMessage(tgId, text);

      if (res.ok) {
        await prisma.notifications_outbox.update({
          where: { id: row.id },
          data: { status: "SENT", sent_at: new Date() },
        });
      } else {
        const nextAttempts = row.attempts + 1;
        await prisma.notifications_outbox.update({
          where: { id: row.id },
          data: { status: nextAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", attempts: nextAttempts },
        });
      }

      // маленькая пауза, чтобы не получить flood
      await sleep(80);
    } catch (e) {
      console.error("[notifications] send error:", e);
      // не роняем процесс
    }
  }
}

async function updateCampaignStatuses(tx, campaignIds) {
  if (!tx.broadcast_campaigns || !tx.broadcast_tasks) return;

  const uniqueIds = Array.from(new Set(campaignIds.map((x) => String(x))));
  for (const id of uniqueIds) {
    try {
      const pending = await tx.broadcast_tasks.count({
        where: { campaign_id: BigInt(id), status: "PENDING" },
      });

      if (pending > 0) continue;

      const failed = await tx.broadcast_tasks.count({
        where: { campaign_id: BigInt(id), status: "FAILED" },
      });

      await tx.broadcast_campaigns.update({
        where: { id: BigInt(id) },
        data: { status: failed > 0 ? "FAILED" : "COMPLETED", finished_at: new Date() },
      });
    } catch (e) {
      console.error("[broadcast] status update error:", e);
    }
  }
}

async function processBroadcastBatch() {
  if (!prisma.broadcast_tasks || !prisma.broadcast_campaigns) return;

  const tasks = await prisma.broadcast_tasks.findMany({
    where: { status: "PENDING", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { created_at: "asc" },
    take: BROADCAST_BATCH,
    include: { user: true, campaign: true },
  });

  if (!tasks.length) return;

  const touchedCampaigns = [];

  for (const t of tasks) {
    try {
      const tgId = t.user?.tg_id ? Number(t.user.tg_id) : null;
      touchedCampaigns.push(t.campaign_id);

      if (!tgId) {
        await prisma.broadcast_tasks.update({
          where: { id: t.id },
          data: { status: "FAILED", attempts: t.attempts + 1, sent_at: new Date() },
        });
        continue;
      }

      const msg = String(t.campaign?.message || "").trim();
      const res = await safeSendMessage(tgId, msg || "🔔 Уведомление");

      if (res.ok) {
        await prisma.broadcast_tasks.update({
          where: { id: t.id },
          data: { status: "SENT", sent_at: new Date() },
        });
      } else {
        const nextAttempts = t.attempts + 1;
        await prisma.broadcast_tasks.update({
          where: { id: t.id },
          data: { status: nextAttempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", attempts: nextAttempts },
        });
      }

      await sleep(80);
    } catch (e) {
      console.error("[broadcast] send error:", e);
    }
  }

  // mark campaigns completed/failed when no pending tasks remain
  try {
    await prisma.$transaction(async (tx) => updateCampaignStatuses(tx, touchedCampaigns));
  } catch (e) {
    console.error("[broadcast] campaign status tx error:", e);
  }
}

function initNotificationsWorker(bot) {
  botRef = bot;
  if (started) return;
  started = true;

  setInterval(async () => {
    try {
      await processOutboxBatch();
    } catch (e) {
      console.error("[notifications] worker error:", e);
    }
  }, 2500);

  // broadcast tasks (separate queue)
  setInterval(async () => {
    try {
      await processBroadcastBatch();
    } catch (e) {
      console.error("[broadcast] worker error:", e);
    }
  }, 2500);
}

module.exports = { initNotificationsWorker };
