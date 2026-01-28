const captchaAnswers = new Map();

const captcha_dict = {
  "Яблоко": "🍎",
  "Машину": "🚗",
  "Конфету": "🍬",
  "Мяч": "⚽️",
  "Часы": "⌚️",
};

function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateCaptcha(userId) {
  const words = Object.keys(captcha_dict);
  const correctWord = words[Math.floor(Math.random() * words.length)];
  const correctEmoji = captcha_dict[correctWord];

  const allEmojis = Object.values(captcha_dict);
  const wrongEmojis = allEmojis.filter(emoji => emoji !== correctEmoji);
  const selectedWrong = getRandomItems(wrongEmojis, 3);

  const options = [correctEmoji, ...selectedWrong].sort(() => 0.5 - Math.random());

  captchaAnswers.set(userId, correctEmoji);

  return { word: correctWord, options, correct: correctEmoji };
}

function checkCaptcha(userId, answer) {
  const correct = captchaAnswers.get(userId);
  if (correct === answer) {
    captchaAnswers.delete(userId);
    return true;
  }
  return false;
}

module.exports = { generateCaptcha, checkCaptcha };
