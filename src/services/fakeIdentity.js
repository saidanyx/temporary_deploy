// src/services/fakeIdentity.js
"use strict";

const crypto = require("crypto");

const FIRST_NAMES = ["Александр", "Алексей", "Андрей", "Антон", "Артём", "Богдан", "Вадим", "Валерий", "Василий", "Виктор", "Виталий", "Владимир", "Владислав", "Георгий", "Глеб", "Даниил", "Денис", "Дмитрий", "Евгений", "Егор", "Иван", "Илья", "Кирилл", "Константин", "Лев", "Максим", "Марк", "Матвей", "Михаил", "Никита", "Николай", "Олег", "Павел", "Пётр", "Роман", "Руслан", "Семён", "Сергей", "Станислав", "Тимофей", "Фёдор", "Юрий", "Ярослав", "Алина", "Алёна", "Анастасия", "Анна", "Валентина", "Вера", "Виктория", "Галина", "Дарья", "Диана", "Евгения", "Екатерина", "Елена", "Елизавета", "Инна", "Ирина", "Карина", "Ксения", "Лариса", "Маргарита", "Марина", "Мария", "Надежда", "Наталья", "Нина", "Оксана", "Ольга", "Полина", "Светлана", "София", "Татьяна", "Ульяна", "Юлия", "Яна", "Вероника", "Айдар", "Арсен", "Бекзат", "Тимур", "Эмир", "Рамиль", "Ильдар", "Рустам", "Эльдар", "Азат", "Элина", "Айгуль", "Диляра", "Лейла", "Мадина", "Самира", "Зарина", "Айсель", "Alex", "Andrew", "Ben", "Charlie", "Chris", "Daniel", "David", "Ethan", "Finn", "Jack", "James", "Jason", "Kevin", "Leo", "Liam", "Luke", "Max", "Mike", "Nathan", "Noah", "Oliver", "Ryan", "Sam", "Tom", "Tyler", "William", "Alice", "Amelia", "Bella", "Chloe", "Daisy", "Ella", "Emily", "Grace", "Hannah", "Isla", "Julia", "Kate", "Lily", "Lucy", "Mia", "Nora", "Olivia", "Sophie", "Zoe", "Саша", "Саня", "Лёша", "Андрюха", "Антоха", "Тёма", "Вадик", "Валера", "Вася", "Витя", "Вова", "Слава", "Гоша", "Глебка", "Даня", "Денчик", "Дима", "Женя", "Егорка", "Ваня", "Илюха", "Кирюха", "Костя", "Лёва", "Макс", "Марик", "Мотя", "Миша", "Никитос", "Коля", "Олежка", "Паша", "Петя", "Ромка", "Русик", "Серёга", "Стас", "Тима", "Федя", "Юрец", "Ярик", "Настя", "Аня", "Вика", "Даша", "Катя", "Лена", "Лиза", "Ира", "Ксюша", "Маша", "Наташа", "Оля", "Соня", "Таня", "Юля", "Яночка", "Надя", "Рита", "Света", "Sasha", "Masha", "Vanya", "Dima", "Katya", "Anya", "Vika", "Olya", "Nastya", "Sergey", "Andrey", "Ilya", "Fedor", "Veronika", "Timur", "Rustam", "Azat", "Madina", "Aygul", "Zarina", "Артур", "Ян", "Викентий", "Герман", "Эдуард", "Платон", "Аркадий", "Леонид", "Геннадий", "Вениамин", "Яков", "Святослав", "Эмиль", "Камиль", "Савва", "Игнат", "Клим", "Родион", "Эрик", "Ринат", "Ариана", "Милана", "Мира", "Василиса", "Есения", "Кристина", "Людмила", "Любовь", "Алла", "Инга", "Снежана", "Марьяна", "Олеся", "Злата", "Эмилия", "Влада", "Нелли", "Жанна", "Виолетта", "Мия", "Эва", "Стефания", "Агата", "Аделина", "Лиана", "Алиса"];
const ADJ = ["Lucky", "Neon", "Silent", "Crazy", "Turbo", "Fast", "Icy", "Dark", "Golden", "Silver", "Wild", "Red", "Blue", "Green", "Pink", "Hyper", "Mega", "Ultra", "Smooth", "Brave", "Sharp", "Fierce", "Calm", "Storm", "Nova", "Epic", "Royal", "Urban", "Night", "Sunny", "Frost", "Shadow", "Ghost", "Atomic", "Cosmic", "Pixel", "Glitch", "Crypto", "Vegas", "Kazan", "Moscow", "Siber", "Ural", "Volga", "Polar", "Vivid", "Rusty", "Swift", "Iron", "Steel", "Ruby", "Emerald", "Sapphire", "Jolly", "Daring", "Breezy", "Keen"];
const NOUN = ["Gambler", "Spinner", "Roller", "Ace", "King", "Queen", "Jack", "Dealer", "Pilot", "Sniper", "Hunter", "Runner", "Wizard", "Ninja", "Samurai", "Viking", "Wolf", "Fox", "Bear", "Tiger", "Eagle", "Raven", "Shark", "Dragon", "Phoenix", "Comet", "Rocket", "Miner", "Darter", "Bowler", "Hooper", "Striker", "Player", "Legend", "Master", "Pro", "Rookie", "Boss", "Bandit", "Nomad", "Rider", "Caster", "Hacker", "Coder", "Snows", "Blade", "Spark", "Chip", "Token", "Bet", "Stake", "Fortune", "Chance", "Dice", "Wheel", "Slot", "Card"];
const RU_WORDS = ["Лаки", "Везунчик", "Игрок", "Ставочник", "Дартс", "Боулинг", "Ракета", "Мины", "Кубик", "Слоты", "Блэкджек", "Фортуна", "Казино", "Вегас", "Чип", "Монетка", "Туз", "Король", "Дама", "Джокер", "Шанс", "Удача", "Победа", "Риск", "Хайроллер", "Стример", "Снайпер", "Волк", "Лис", "Тигр", "Медведь", "Дракон", "Феникс", "Комета", "Пилот", "Рейнджер", "Капитан", "Спринтер", "Шторм", "Неон", "Турбо", "Глитч", "Пиксель"];

const recent = new Set();
const RECENT_MAX = 80;

function randInt(max) {
  return crypto.randomInt(0, max);
}

function remember(value) {
  recent.add(value);
  if (recent.size > RECENT_MAX) {
    // crude eviction
    const first = recent.values().next().value;
    recent.delete(first);
  }
}

function pickDistinct(makeFn, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const v = makeFn();
    if (!recent.has(v)) {
      remember(v);
      return v;
    }
  }
  const v = makeFn();
  remember(v);
  return v;
}

function pickName() {
  return pickDistinct(() => FIRST_NAMES[randInt(FIRST_NAMES.length)]);
}

function pickNickname() {
  return pickDistinct(() => {
    // 50/50: RU-word style vs EN gamer-style
    const useRu = randInt(2) === 0;
    if (useRu) {
      const base = RU_WORDS[randInt(RU_WORDS.length)];
      const num = randInt(900) + 100; // 100-999
      const sep = randInt(3) === 0 ? "_" : "";
      return (base + sep + num).slice(0, 32);
    }
    const a = ADJ[randInt(ADJ.length)];
    const n = NOUN[randInt(NOUN.length)];
    const num = randInt(98) + 2; // 2-99
    const sep = randInt(3) === 0 ? "_" : "";
    return (a + sep + n + num).slice(0, 32);
  });
}

module.exports = {
  pickName,
  pickNickname,
};
