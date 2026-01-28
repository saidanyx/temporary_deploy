// tests/setup.js
// Ensure modules that depend on Prisma don't try to connect to a real DB during unit tests.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/testdb";
process.env.BOT_TOKEN = process.env.BOT_TOKEN || "TEST_BOT_TOKEN";
process.env.CRYPTOBOT_API_TOKEN = process.env.CRYPTOBOT_API_TOKEN || "TEST_CRYPTOBOT";

// Minimal Prisma mock (only what unit tests require). Individual tests can override as needed.
global.prisma = global.prisma || {
  $transaction: async (fn) => fn(global.prisma),
};

afterAll(async () => {
  // clean up global mock
  // eslint-disable-next-line no-undef
  delete global.prisma;
});
