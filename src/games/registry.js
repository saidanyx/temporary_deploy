// src/games/registry.js

/**
 * Registry — это ТОЛЬКО каталог игр для меню.
 * Никакой бизнес-логики.
 * Никаких картинок.
 * Никаких правил.
 */

const games = [
  { id: "dice", title: "🎲 Кубик" },
  { id: "blackjack", title: "🃏 Блэкджек" },
  { id: "mines", title: "💣 Мины" },
  { id: "rocket", title: "🚀 Ракета" },
  { id: "slots", title: "🎰 Слоты" },
  { id: "bowling", title: "🎳 Боулинг" },
  { id: "football", title: "⚽ Футбол" },
  { id: "basketball", title: "🏀 Баскетбол" },
  { id: "wheel", title: "🎡 Колесо Фортуны" },
  { id: "rps", title: "✂️ Камень! Ножницы! Бумага!" },
  { id: "boxes", title: "📦 Коробки" },
  { id: "darts", title: "🎯 Дартс" },
];

function listGames() {
  return games;
}

function hasGame(id) {
  return games.some((g) => g.id === id);
}

module.exports = {
  listGames,
  hasGame,
};
