// src/services/fakePayouts.js
"use strict";

const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

const { publishFakePayoutToPaymentsChannel } = require("./channel");
const fakeIdentity = require("./fakeIdentity");

class FakePayoutsService {
  constructor() {
    this.timeoutId = null;
    this.config = null;
  }

  async ensureAdminConfig() {
    let cfg = await prisma.admin.findFirst();
    if (!cfg) {
      cfg = await prisma.admin.create({
        data: {
          fake_payouts_enabled_default: false,
          fake_payouts_sec: [120, 600],
        },
      });
    }
    return cfg;
  }

  async getConfig() {
    const cfg = await this.ensureAdminConfig();

    const arr = Array.isArray(cfg.fake_payouts_sec) ? cfg.fake_payouts_sec : [120, 600];
    const min = Number(arr[0] ?? 120);
    const max = Number(arr[1] ?? 600);

    this.config = {
      id: cfg.id,
      enabled: !!cfg.fake_payouts_enabled_default,
      min_sec: Number.isFinite(min) ? min : 120,
      max_sec: Number.isFinite(max) ? max : 600,
    };

    return this.config;
  }

  async setConfig({ enabled, min_sec, max_sec }) {
    if (!this.config) await this.getConfig();

    const nextEnabled = enabled !== undefined ? !!enabled : this.config.enabled;
    const nextMin = min_sec !== undefined ? Number(min_sec) : this.config.min_sec;
    const nextMax = max_sec !== undefined ? Number(max_sec) : this.config.max_sec;

    const cfg = await prisma.admin.update({
      where: { id: this.config.id },
      data: {
        fake_payouts_enabled_default: nextEnabled,
        fake_payouts_sec: [nextMin, nextMax],
      },
    });

    const arr = Array.isArray(cfg.fake_payouts_sec) ? cfg.fake_payouts_sec : [120, 600];
    this.config.enabled = !!cfg.fake_payouts_enabled_default;
    this.config.min_sec = Number(arr[0] ?? 120);
    this.config.max_sec = Number(arr[1] ?? 600);

    this.restart();
    return this.config;
  }

  start() {
    this.stop();
    this.scheduleNext();
  }

  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  restart() {
    this.stop();
    this.start();
  }

  async scheduleNext() {
    if (!this.config) await this.getConfig();
    if (!this.config.enabled) return;

    const min = Math.max(1, Number(this.config.min_sec) || 120);
    const max = Math.max(min, Number(this.config.max_sec) || 600);
    const delaySec = min + Math.random() * (max - min);

    this.timeoutId = setTimeout(async () => {
      await this.publishFakePayout();
      this.scheduleNext();
    }, delaySec * 1000);
  }

  pickAmountRub() {
    // Realistic withdrawal amounts (rub)
    const amounts = [
      250, 500, 700, 800, 1000, 1500, 2000, 2500, 3000, 5000, 7000, 10000, 15000, 20000, 30000, 50000,
    ];

    // Slightly bias towards smaller payouts
    const idx = Math.floor(Math.pow(Math.random(), 1.7) * amounts.length);
    const base = amounts[Math.min(idx, amounts.length - 1)];

    // Occasionally produce "odd" looking numbers (e.g., 1490 or 5200)
    if (Math.random() < 0.35) {
      const tweak = [0, 50, 100, 200, 300, 400, 500][Math.floor(Math.random() * 7)];
      const sign = Math.random() < 0.6 ? 1 : -1;
      return Math.max(50, base + sign * tweak);
    }

    return base;
  }

  pickPlayerLabel() {
    if (Math.random() < 0.45) {
      return `@${fakeIdentity.pickNickname()}`;
    }
    return fakeIdentity.pickName();
  }

  async publishFakePayout() {
    try {
      const username = this.pickPlayerLabel();
      const amount = this.pickAmountRub();
      await publishFakePayoutToPaymentsChannel({ username, amount });
    } catch (e) {
      console.error("Fake payout publish error:", e);
    }
  }
}

const service = new FakePayoutsService();

async function initFakePayouts() {
  await service.getConfig();
  service.start();
}

module.exports = { initFakePayouts, service };
