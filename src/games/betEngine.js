// src/games/betEngine.js
// Shared bet validation + cooldown + atomic deduction for *all* games.
// Security-minded: keep balance enforcement atomic in DB (checkingBalance.deductBetWithLedgerAtomic).

const { MESSAGES } = require("../ui/messages");
const { checkAndDeductBet } = require("./checkingBalance");
const { adminService } = require("../services/admin");

const DEFAULTS = Object.freeze({
  minBet: 10,
  maxBet: 10_000,
  cooldownMs: 5_000,
});

// Global bet limits live in DB: admin.min_max_bet.
// Cache briefly to reduce DB load and keep UX snappy.
const LIMITS_CACHE_TTL_MS = 5_000;
let cachedLimits = { minBet: DEFAULTS.minBet, maxBet: DEFAULTS.maxBet, ts: 0 };

async function getGlobalMinMaxBet() {
  const now = Date.now();
  if (now - cachedLimits.ts < LIMITS_CACHE_TTL_MS) return cachedLimits;

  try {
    const { minBet, maxBet } = await adminService.getMinMaxBet();
    cachedLimits = { minBet, maxBet, ts: now };
    return cachedLimits;
  } catch {
    // Fail-safe: never block betting because admin row is missing or DB hiccups.
    cachedLimits = { minBet: DEFAULTS.minBet, maxBet: DEFAULTS.maxBet, ts: now };
    return cachedLimits;
  }
}

// key: `${scope}:${tgUserId}` -> last timestamp
const lastBetAt = new Map();

function normalizeInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i <= 0) return null;
  return i;
}

function normalizeBet(v, { minBet = DEFAULTS.minBet, maxBet = DEFAULTS.maxBet } = {}) {
  const i = normalizeInt(v);
  if (i == null) return null;
  if (i < minBet || i > maxBet) return null;
  return i;
}

function remainingCooldownMs(tgUserId, { scope = "global", cooldownMs = DEFAULTS.cooldownMs } = {}) {
  const key = `${scope}:${tgUserId}`;
  const last = lastBetAt.get(key) || 0;
  const now = Date.now();
  const left = cooldownMs - (now - last);
  return left > 0 ? left : 0;
}

function touchCooldown(tgUserId, { scope = "global" } = {}) {
  const key = `${scope}:${tgUserId}`;
  lastBetAt.set(key, Date.now());
}

async function guardCooldown(ctx, { scope, cooldownMs }) {
  const left = remainingCooldownMs(ctx.from.id, { scope, cooldownMs });
  if (left <= 0) return true;
  const sec = Math.ceil(left / 1000);
  await ctx.reply(`⏳ Подождите ${sec} секунд перед следующей ставкой.`);
  return false;
}

async function guardBetRange(ctx, bet, { minBet, maxBet }) {
  if (!Number.isFinite(bet) || bet <= 0) {
    await ctx.reply(MESSAGES.INVALID_AMOUNT);
    return false;
  }
  if (bet < minBet || bet > maxBet) {
    await ctx.reply(`❌ Ставка должна быть от ${minBet} до ${maxBet} ₽.`);
    return false;
  }
  return true;
}

/**
 * Validates bet (min/max), checks cooldown, then atomically deducts bet (and writes BET ledger).
 * Returns the same object as checkAndDeductBet + normalized bet.
 */
async function placeBet(ctx, bet, {
  gameId,
  backKb,
  meta,
  // If not explicitly provided, fall back to global limits from admin.min_max_bet
  minBet = undefined,
  maxBet = undefined,
  cooldownMs = DEFAULTS.cooldownMs,
  cooldownScope = null,
} = {}) {
  const scope = cooldownScope || gameId || "global";

  if (minBet == null || maxBet == null) {
    const gl = await getGlobalMinMaxBet();
    if (minBet == null) minBet = gl.minBet;
    if (maxBet == null) maxBet = gl.maxBet;
  }

  const okRange = await guardBetRange(ctx, bet, { minBet, maxBet });
  if (!okRange) return null;

  const okCooldown = await guardCooldown(ctx, { scope, cooldownMs });
  if (!okCooldown) return null;

  // Mark cooldown only when we're about to start an actual bet attempt.
  touchCooldown(ctx.from.id, { scope });

  const result = await checkAndDeductBet(ctx, bet, backKb, meta ?? (gameId ? { game: gameId } : undefined));
  if (!result) return null;

  return { ...result, bet };
}

module.exports = {
  DEFAULTS,
  getGlobalMinMaxBet,
  normalizeBet,
  remainingCooldownMs,
  placeBet,
};
