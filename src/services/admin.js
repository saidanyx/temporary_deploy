// src/services/admin.js
//
// Admin configuration stored in DB (table `admin`) + some settings from env.
// IMPORTANT: keep in sync with prisma/schema.prisma.

"use strict";

const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

const { updateBalance } = require("./wallets");
const { bonusesService } = require("./bonuses");
const { promoDepositsService } = require("./promoDeposits");

/**
 * Convert a canonical Telegram URL (https://t.me/<...>) into a chat_id that can be used
 * with Telegram Bot API methods (sendMessage, getChatMember, etc.).
 *
 * We intentionally support only public @username links here.
 * Invite links (t.me/+...) and internal links (t.me/c/<id>) cannot be reliably used
 * as chat_id for posting/checking subscriptions.
 *
 * @returns {string|null} chat_id like "@mychannel" or null
 */
function toTelegramChatIdFromUrl(url) {
  const u = normalizeTelegramLink(url);
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const first = parts[0];
    if (!first) return null;
    if (first.startsWith("+")) return null;
    if (first === "c") return null;
    if (!/^[A-Za-z0-9_]{4,32}$/.test(first)) return null;
    return `@${first}`;
  } catch {
    return null;
  }
}

function normalizeTelegramLink(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // allow @username or just username
  let s = raw.startsWith("@") ? raw.slice(1) : raw;

  // If only a username, turn into a canonical URL
  if (!s.includes("t.me") && /^[A-Za-z0-9_]{4,32}$/.test(s)) {
    return `https://t.me/${s}`;
  }

  // Add scheme if missing
  if (s.startsWith("t.me/")) s = `https://${s}`;
  if (!/^https?:\/\//i.test(s) && s.includes("t.me/")) s = `https://${s}`;

  try {
    const u = new URL(s);
    if (!/^(t\.me|telegram\.me)$/i.test(u.hostname)) return null;

    const parts = u.pathname.split("/").filter(Boolean);

    // Fix common mistake: https://t.me/c/<username>  (c is only for numeric private ids)
    if (parts[0] === "c" && parts[1] && !/^\d+$/.test(parts[1])) {
      parts.shift(); // drop "c"
    }

    // Join/invite link
    if (parts[0] && parts[0].startsWith("+")) {
      return `https://t.me/${parts[0]}`;
    }

    // Private chat internal link: keep only root /c/<id>
    if (parts[0] === "c" && parts[1] && /^\d+$/.test(parts[1])) {
      return `https://t.me/c/${parts[1]}`;
    }

    // Public username
    if (parts[0] && /^[A-Za-z0-9_]{4,32}$/.test(parts[0])) {
      return `https://t.me/${parts[0]}`;
    }

    return null;
  } catch {
    return null;
  }
}

class AdminService {
  async ensureAdminRow() {
    const existing = await prisma.admin.findFirst();
    if (existing) return existing;
    // Create with schema defaults.
    return prisma.admin.create({ data: {} });
  }

  async getAdminIds() {
    const raw = process.env.ADMIN_IDS || "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));
  }

  async getAdmin() {
    return this.ensureAdminRow();
  }

  async getPercentReferrals() {
    const a = await this.getAdmin();
    return Number(a.percent_referrals ?? 0);
  }

  async setPercentReferrals(input) {
    const v = Number(String(input ?? "").trim().replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error("Invalid percent (expected 0..100)");
    }
    const a = await this.getAdmin();
    await prisma.admin.update({ where: { id: a.id }, data: { percent_referrals: v } });
  }

  async getRulesText() {
    const a = await this.getAdmin();
    return (a.rules_text ?? "").toString();
  }

  async setRulesText(input) {
    const text = String(input ?? "").trim();
    // allow empty (falls back to built-in default on UI)
    const a = await this.getAdmin();
    await prisma.admin.update({ where: { id: a.id }, data: { rules_text: text } });
  }

  async getNewsChannelUrl() {
    const a = await this.getAdmin();
    return a.news_channel_url ? String(a.news_channel_url) : null;
  }

  async getGamesChannelUrl() {
    const a = await this.getAdmin();
    return a.games_channel_url ? String(a.games_channel_url) : null;
  }

  async getPaymentsChannelUrl() {
    const a = await this.getAdmin();
    return a.payments_channel_url ? String(a.payments_channel_url) : null;
  }

  async getGamesChannelChatId() {
    const url = await this.getGamesChannelUrl();
    return url ? toTelegramChatIdFromUrl(url) : null;
  }

  async getPaymentsChannelChatId() {
    const url = await this.getPaymentsChannelUrl();
    return url ? toTelegramChatIdFromUrl(url) : null;
  }

  async setNewsChannelUrl(input) {
    const url = normalizeTelegramLink(input);
    if (!url) throw new Error("Invalid news channel URL (expected @username or https://t.me/...)");
    const a = await this.getAdmin();
    await prisma.admin.update({ where: { id: a.id }, data: { news_channel_url: url } });
  }

  async setGamesChannelUrl(input) {
    const url = normalizeTelegramLink(input);
    if (!url) throw new Error("Invalid games channel URL (expected @username or https://t.me/...)");
    const a = await this.getAdmin();
    await prisma.admin.update({ where: { id: a.id }, data: { games_channel_url: url } });
  }

  async setPaymentsChannelUrl(input) {
    const url = normalizeTelegramLink(input);
    if (!url) throw new Error("Invalid payments channel URL (expected @username or https://t.me/...)");
    const a = await this.getAdmin();
    await prisma.admin.update({ where: { id: a.id }, data: { payments_channel_url: url } });
  }

  async getFakeBetsEnabledDefault() {
    const a = await this.getAdmin();
    return a.fake_bets_enabled_default ?? false;
  }

  async getFakeBetsMinSecDefault() {
    const a = await this.getAdmin();
    return Array.isArray(a.fake_bets_sec) ? Number(a.fake_bets_sec[0] ?? 30) : 30;
  }

  async getFakeBetsMaxSecDefault() {
    const a = await this.getAdmin();
    return Array.isArray(a.fake_bets_sec) ? Number(a.fake_bets_sec[1] ?? 120) : 120;
  }

  async setFakeBetsSecRange(minSec, maxSec) {
    const min = Number(minSec);
    const max = Number(maxSec);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min >= max) {
      throw new Error("Invalid fake bets range");
    }
    const a = await this.getAdmin();
    await prisma.admin.update({ where: { id: a.id }, data: { fake_bets_sec: [min, max] } });
  }

  /* -------------------- Global bet limits -------------------- */

  async getMinMaxBet() {
    const a = await this.getAdmin();
    const arr = Array.isArray(a.min_max_bet) ? a.min_max_bet : [10, 10000];
    const min = Number(arr[0]);
    const max = Number(arr[1]);

    // Defensive: schema default is [10, 10000], but DB can contain junk.
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || min >= max) {
      return { minBet: 10, maxBet: 10000 };
    }

    return { minBet: Math.floor(min), maxBet: Math.floor(max) };
  }

  async setMinMaxBet(minBet, maxBet) {
    const min = Number(minBet);
    const max = Number(maxBet);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error("Неверный формат. Ожидается: min max");
    }
    const mi = Math.floor(min);
    const ma = Math.floor(max);
    if (mi <= 0 || ma <= 0 || mi >= ma) {
      throw new Error("Некорректный диапазон. Должно быть: min > 0, max > 0, min < max");
    }

    const a = await this.getAdmin();
    await prisma.admin.update({ where: { id: a.id }, data: { min_max_bet: [mi, ma] } });
  }

  // Admin top-up helper (kept for existing admin flow)
  async replenishBalance(userId, amount) {
    const rub = Number(amount);
    if (!rub || Number.isNaN(rub) || rub <= 0) throw new Error("Invalid amount");

    const invoiceId = `ADMIN_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    const dep = await prisma.deposits.create({
      data: {
        user_id: userId,
        provider: "ADMIN",
        invoice_id: invoiceId,
        amount: rub,
        currency: "RUB",
        status: "PAID",
        paid_at: new Date(),
        payload: { admin_topup: true },
        updated_at: new Date(),
      },
    });

    await updateBalance(userId, rub);

    await prisma.ledger.create({
      data: {
        user_id: userId,
        type: "ADJUST",
        amount: rub,
        meta: { reason: "admin_replenish", deposit_id: dep.id },
      },
    });

    // newbie (если активирован)
    try {
      await bonusesService.awardDepositBonusIfEligible(userId, dep.id, rub);
    } catch (e) {
      console.error("Admin topup newbie bonus error:", e);
    }

    // promo FIFO
    try {
      await promoDepositsService.awardPromoBonusIfEligible(userId, dep.id, rub);
    } catch (e) {
      console.error("Admin topup promo bonus error:", e);
    }

    return { ok: true, deposit_id: dep.id };
  }
}

const adminService = new AdminService();
module.exports = { adminService, normalizeTelegramLink, toTelegramChatIdFromUrl };
