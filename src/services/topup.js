// src/services/topup.js

/**
 * Topup rules (per product requirements):
 * - user sees/inputs RUB amounts
 * - provider asset only USDT
 *
 * @param {number} amountRub
 * @param {string} currency
 */
function normalizeTopupParams(amountRub, currency) {
  const cur = String(currency || "").trim().toUpperCase();
  if (cur !== "USDT") {
    const err = new Error("Разрешена только валюта USDT");
    err.code = "TOPUP_CURRENCY_NOT_ALLOWED";
    throw err;
  }

  const n = Number(amountRub);
  if (!Number.isFinite(n)) {
    const err = new Error("Некорректная сумма");
    err.code = "TOPUP_AMOUNT_INVALID";
    throw err;
  }

  // RUB amounts are expected as integers.
  const amount = Math.trunc(n);
  if (amount <= 0) {
    const err = new Error("Сумма должна быть больше 0");
    err.code = "TOPUP_AMOUNT_INVALID";
    throw err;
  }
  if (amount > 10000) {
    const err = new Error("Максимум 10000 ₽");
    err.code = "TOPUP_AMOUNT_TOO_LARGE";
    throw err;
  }

  return { amountRub: amount, currency: "USDT" };
}

module.exports = { normalizeTopupParams };
