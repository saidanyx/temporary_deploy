require("dotenv").config();

// Only env variables from .env
function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

module.exports = {
  // Variables that are in .env - read ONLY from env
  BOT_TOKEN: must("BOT_TOKEN"),
  DATABASE_URL: must("DATABASE_URL"),
  CRYPTOBOT_API_TOKEN: must("CRYPTOBOT_API_TOKEN"),

  // Admins (comma-separated Telegram user IDs)
  ADMIN_IDS: must("ADMIN_IDS"),
};
