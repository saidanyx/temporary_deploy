const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

function genRefCode() {
  // простой, но лучше чем Math.random один раз
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

async function getOrCreateUser(tg_id, username = null, referrer_code = null) {
  const tgId = BigInt(tg_id);

  // 1) Пытаемся найти пользователя
  let user = await prisma.users.findUnique({
    where: { tg_id: tgId },
    include: { wallets: true },
  });

  // 2) Если нет — создаём вместе с кошельком
  if (!user) {
    let referrer_id = null;
    if (referrer_code) {
      const referrer = await prisma.users.findUnique({
        where: { ref_code: referrer_code },
        select: { id: true },
      });
      if (referrer) {
        referrer_id = referrer.id;
      }
    }

    user = await prisma.users.create({
      data: {
        tg_id: tgId,
        username,
        ref_code: genRefCode(),
        referrer_id,
        wallets: {
          create: {}, // создаст запись в таблице wallets с user_id = users.id
        },
      },
      include: { wallets: true },
    });

    return user;
  }

  // 3) Если есть — обновим username при необходимости
  if (username && user.username !== username) {
    user = await prisma.users.update({
      where: { tg_id: tgId },
      data: { username },
      include: { wallets: true },
    });
  }

  // 4) Если по каким-то причинам кошелька нет — создаём
  if (!user.wallets) {
    await prisma.wallets.create({
      data: { user_id: user.id },
    });

    user = await prisma.users.findUnique({
      where: { tg_id: tgId },
      include: { wallets: true },
    });
  }

  return user;
}

async function updateCaptchaPassed(tg_id, passed = true) {
  const tgId = BigInt(tg_id);
  await prisma.users.update({
    where: { tg_id: tgId },
    data: { captcha_passed: passed },
  });
}

module.exports = { getOrCreateUser, updateCaptchaPassed };
