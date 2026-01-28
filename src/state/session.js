// src/state/session.js

const pending = new Map(); // userId -> { type, gameId, ... }
const awaitingCustomBets = new Map(); // userId -> gameId

function setPending(userId, payload) {
  if (!payload) {
    pending.delete(userId);
    return;
  }
  pending.set(userId, payload);
}

// ✅ твой текущий подход: "прочитал -> удалил"
function popPending(userId) {
  const p = pending.get(userId);
  pending.delete(userId);
  return p;
}

// ✅ НОВОЕ: безопасно посмотреть, не удаляя
function getPending(userId) {
  return pending.get(userId) || null;
}

// ✅ НОВОЕ: очистить pending вручную
function clearPending(userId) {
  pending.delete(userId);
}

function setAwaitingCustomBet(userId, gameId) {
  awaitingCustomBets.set(userId, gameId);
}

function popAwaitingCustomBet(userId) {
  const gameId = awaitingCustomBets.get(userId);
  awaitingCustomBets.delete(userId);
  return gameId;
}

module.exports = {
  setPending,
  popPending,
  getPending,
  clearPending,
  setAwaitingCustomBet,
  popAwaitingCustomBet,
};
