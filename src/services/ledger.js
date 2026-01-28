const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

async function addLedgerEntry(user_id, type, amount, currency_type = 'REAL', meta = null, tx = prisma) {
  return await tx.ledger.create({
    data: {
      user_id,
      type,
      amount,
      meta,
    },
  });
}

module.exports = { addLedgerEntry };
