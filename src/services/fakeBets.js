// src/services/fakeBets.js
"use strict";

const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();
const { publishFakeBetToChannel } = require("./channel");
const registry = require("../games/registry");

const fakeIdentity = require("./fakeIdentity");

class FakeBetsService {
  constructor() {
    this.timeoutId = null;
    this.config = null;
  }

  async ensureAdminConfig() {
    let cfg = await prisma.admin.findFirst();
    if (!cfg) {
      cfg = await prisma.admin.create({ data: { fake_bets_enabled_default: false, fake_bets_sec: [30, 120] } });
    }
    return cfg;
  }

  async getConfig() {
    const cfg = await this.ensureAdminConfig();
    const arr = Array.isArray(cfg.fake_bets_sec) ? cfg.fake_bets_sec : [30, 120];
    const min = Number(arr[0] ?? 30);
    const max = Number(arr[1] ?? 120);

    this.config = {
      id: cfg.id,
      enabled: !!cfg.fake_bets_enabled_default,
      min_sec: Number.isFinite(min) ? min : 30,
      max_sec: Number.isFinite(max) ? max : 120,
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
        fake_bets_enabled_default: nextEnabled,
        fake_bets_sec: [nextMin, nextMax],
      },
    });

    const arr = Array.isArray(cfg.fake_bets_sec) ? cfg.fake_bets_sec : [30, 120];
    this.config.enabled = !!cfg.fake_bets_enabled_default;
    this.config.min_sec = Number(arr[0] ?? 30);
    this.config.max_sec = Number(arr[1] ?? 120);

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

    const min = Math.max(1, Number(this.config.min_sec) || 30);
    const max = Math.max(min, Number(this.config.max_sec) || 120);
    const delaySec = min + Math.random() * (max - min);

    this.timeoutId = setTimeout(async () => {
      await this.publishFakeBet();
      this.scheduleNext();
    }, delaySec * 1000);
  }

  async publishFakeBet() {
    try {
      const nickname = fakeIdentity.pickName();
      const games = registry.listGames();
      const game = games[Math.floor(Math.random() * games.length)];
      const gameName = game.title;
      const gameId = game.id;

      const realisticBets = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
      const bet = realisticBets[Math.floor(Math.random() * realisticBets.length)];

      const rand = Math.random() * 100;

      let payout = 0;
      let mult = 0;
      let resultSummary = "Проигрыш";

      if (rand < 78) {
        mult = 0;
        payout = 0;
        resultSummary = "Проигрыш";
      } else if (rand < 96) {
        mult = 1.2 + Math.random() * 0.5;
        payout = bet * mult;
        resultSummary = `Выигрыш x${mult.toFixed(1)}`;
      } else if (rand < 99.5) {
        mult = 3 + Math.random() * 4;
        payout = bet * mult;
        resultSummary = `Большой выигрыш x${mult.toFixed(1)}`;
      } else {
        mult = 14;
        payout = bet * mult;
        resultSummary = "ДЖЕКПОТ x14!";
      }

      payout = Math.round(payout * 100) / 100;

      await publishFakeBetToChannel({
        gameName,
        gameId,
        username: nickname,
        bet,
        resultSummary,
        payout,
      });
    } catch (e) {
      console.error("Fake bet publish error:", e);
    }
  }
}

const service = new FakeBetsService();

async function initFakeBets() {
  await service.getConfig();
  service.start();
}

module.exports = { initFakeBets, service };
