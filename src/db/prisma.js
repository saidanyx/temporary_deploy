// src/db/prisma.js
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

let prisma;

function getPrisma() {
  // Если в тестах подменили global.prisma — используем
  if (global.prisma) return global.prisma;

  // Кешируем один инстанс на процесс
  if (prisma) return prisma;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });

  return prisma;
}

module.exports = { getPrisma };
