// prisma/seed.js
const path = require("path");

// ВАЖНО: используем ваш getPrisma(), а не new PrismaClient()
const { getPrisma } = require(path.join(process.cwd(), "src", "db", "prisma"));
const prisma = getPrisma();

async function main() {
  // 1) Гарантируем, что есть admin row (у тебя код часто делает findFirst)
  // Если у тебя в миграциях уже есть init_admin — всё равно безопасно.
  const admin = await prisma.admin.findFirst();
  if (!admin) {
    await prisma.admin.create({ data: {} });
  }

  // 2) Сидим бонусы (2 штуки)
  // DEPOSIT bonus — меняется в админке через config.percent
  // DAILY bonus — меняется в админке через config.min/max + (по желанию) buckets
  const bonusesToUpsert = [
    {
      type: "DEPOSIT_15_NEWBIE",
      name: "🎁 Бонус к первому депозиту",
      description:
        "После первого пополнения баланса вам автоматически начисляется бонус (по умолчанию 15%).",
      is_active: true,
      config: { percent: 15 },
    },
    {
      type: "DAILY_RANDOM_10_5000",
      name: "🎁 Ежедневный бонус",
      description:
        "Раз в сутки вы можете получить бонус на баланс. Требуется подписка на 2 канала (Игры/Выплаты).",
      is_active: true,
      config: {
        min: 10,
        max: 5000,
        // опционально: “как казино” — чаще маленькие, редко большие
        buckets: [
          { from: 10, to: 50, weight: 40 },
          { from: 51, to: 150, weight: 30 },
          { from: 151, to: 500, weight: 18 },
          { from: 501, to: 1500, weight: 8 },
          { from: 1501, to: 5000, weight: 4 },
        ],
      },
    },
  ];

  for (const b of bonusesToUpsert) {
    await prisma.bonuses.upsert({
      where: { type: b.type },
      update: {
        name: b.name,
        description: b.description,
        is_active: b.is_active,
        config: b.config,
        updated_at: new Date(),
      },
      create: {
        type: b.type,
        name: b.name,
        description: b.description,
        is_active: b.is_active,
        config: b.config,
      },
    });
  }

  const count = await prisma.bonuses.count();
  console.log(`✅ Seed done. bonuses count = ${count}`);
}

main()
  .then(async () => {
    // prisma может быть singleton-ом, но disconnect всё равно ок
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    try {
      await prisma.$disconnect();
    } catch {}
    process.exit(1);
  });
