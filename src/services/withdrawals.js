const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const { Prisma } = require("@prisma/client");

const MIN_WITHDRAWAL = 500;
const COMMISSION_PERCENT = 10;

const WITHDRAW_NETWORKS = ["TRC20", "ERC20"];

function normalizeNetwork(network) {
  const n = String(network || "").trim().toUpperCase();
  if (!WITHDRAW_NETWORKS.includes(n)) throw new Error("Некорректная сеть вывода");
  return n;
}

function validateAddress(network, address) {
  const addr = String(address || "").trim();
  if (!addr) throw new Error("Адрес для вывода пустой");

  if (network === "TRC20") {
    // Tron base58: starts with T
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
      throw new Error("Неверный TRC20 адрес. Адрес должен начинаться с T...");
    }
  }
  if (network === "ERC20") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      throw new Error("Неверный ERC20 адрес. Адрес должен начинаться с 0x...");
    }
  }
  return addr;
}

function toDec(n) {
  // Prisma.Decimal-safe
  if (n instanceof Prisma.Decimal) return n;
  if (typeof n === "bigint") return new Prisma.Decimal(n.toString());
  if (typeof n === "number") {
    if (!Number.isFinite(n)) throw new Error("Некорректная сумма");
    return new Prisma.Decimal(n);
  }
  const s = String(n ?? "").trim();
  if (!s) throw new Error("Некорректная сумма");
  return new Prisma.Decimal(s);
}

async function createWithdrawal(userId, amount, params) {
  const network = normalizeNetwork(params?.network);
  const addr = validateAddress(network, params?.address);
  const commentRaw = String(params?.comment || "").trim();
  const comment = commentRaw ? commentRaw.slice(0, 500) : null;

  const amountDec = toDec(amount);
  if (amountDec.lt(MIN_WITHDRAWAL)) {
    throw new Error(`Минимальная сумма вывода: ${MIN_WITHDRAWAL} ₽`);
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: { wallets: true },
  });
  if (!user || !user.wallets) throw new Error("User or wallet not found");

  const current = toDec(user.wallets.balance_real);

  const commission = amountDec.mul(COMMISSION_PERCENT).div(100);
  const total = amountDec.plus(commission);

  if (current.lt(total)) {
    throw new Error(
      `Недостаточно средств. Баланс: ${current.toFixed(2)} ₽. Нужно: ${total.toFixed(
        2
      )} ₽ (включая комиссию)`
    );
  }

  const withdrawal = await prisma.$transaction(async (tx) => {
    const w = await tx.withdrawals.create({
      data: {
        user_id: userId,
        amount: amountDec,
        commission,
        // total НЕ сохраняем: поля нет в schema
        address: addr,
        network,
        comment,
        status: "PENDING",
      },
    });

    await tx.wallets.update({
      where: { user_id: userId },
      data: {
        balance_real: { decrement: total },
        balance_reserved: { increment: total },
      },
    });

    return w;
  });

  return withdrawal;
}

module.exports = {
  createWithdrawal,
  MIN_WITHDRAWAL,
  COMMISSION_PERCENT,
  normalizeNetwork,
  validateAddress,
};
