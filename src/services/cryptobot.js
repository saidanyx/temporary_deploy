const axios = require('axios');
const config = require('../config');

function normalizeBotUsername(raw) {
  // Accept: "@name", "name", "https://t.me/name" and normalize to "name"
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/^https?:\/\/t\.me\//i, "");
  s = s.replace(/^@/, "");
  // remove query string / path
  s = s.split("?")[0].split("/")[0];
  return s;
}

class CryptoBot {
  constructor() {
    this.apiUrl = 'https://pay.crypt.bot/api';
    this.token = config.CRYPTOBOT_API_TOKEN;
    // Hardcoded exchange rates (RUB to crypto) - fallback
    this.fallbackRates = {
      USDT: 0.011, // 1 RUB ≈ 0.011 USDT
      BTC: 0.00000015, // 1 RUB ≈ 0.00000015 BTC
      ETH: 0.0000005, // 1 RUB ≈ 0.0000005 ETH
      TON: 0.0005 // 1 RUB ≈ 0.0005 TON
    };
    this.exchangeRates = { ...this.fallbackRates };
    this.ratesCache = null;
    this.cacheExpiry = 0;
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async fetchExchangeRates() {
    const now = Date.now();
    if (this.ratesCache && (now - this.cacheExpiry) < this.cacheTTL) {
      this.exchangeRates = { ...this.ratesCache };
      return;
    }

    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'tether,bitcoin,ethereum,toncoin',
          vs_currencies: 'rub'
        },
        timeout: 5000
      });

      if (response.data) {
        this.ratesCache = {
          USDT: 1 / response.data.tether.rub,
          BTC: 1 / response.data.bitcoin.rub,
          ETH: 1 / response.data.ethereum.rub,
          TON: 1 / response.data.toncoin.rub
        };
        this.cacheExpiry = now;
        this.exchangeRates = { ...this.ratesCache };
      }
    } catch (error) {
      console.warn('Failed to fetch exchange rates from CoinGecko, using fallback:', error.message);
      this.exchangeRates = { ...this.fallbackRates };
    }
  }

  async convertRUBToCrypto(amountRUB, asset) {
    await this.fetchExchangeRates();
    const rate = this.exchangeRates[asset];
    if (!rate) {
      throw new Error(`Exchange rate not found for asset: ${asset}`);
    }
    return amountRUB * rate;
  }

  async convertCryptoToRUB(amountCrypto, asset) {
    await this.fetchExchangeRates();
    const rate = this.exchangeRates[asset];
    if (!rate) {
      throw new Error(`Exchange rate not found for asset: ${asset}`);
    }
    return amountCrypto / rate;
  }

  async convertRUBToUSD(amountRUB) {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'tether',
          vs_currencies: 'rub'
        },
        timeout: 5000
      });

      if (response.data && response.data.tether && response.data.tether.rub) {
        const usdPerRub = 1 / response.data.tether.rub;
        return amountRUB * usdPerRub;
      }
    } catch (error) {
      console.warn('Failed to fetch USD rate from CoinGecko, using fallback:', error.message);
    }

    // Fallback: 1 USD ≈ 90 RUB (adjust based on current rates)
    const fallbackUsdPerRub = 1 / 90;
    return amountRUB * fallbackUsdPerRub;
  }

  async convertUSDToRUB(amountUSD) {
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids: 'tether',
          vs_currencies: 'rub'
        },
        timeout: 5000
      });

      if (response.data && response.data.tether && response.data.tether.rub) {
        const rubPerUsd = response.data.tether.rub;
        return amountUSD * rubPerUsd;
      }
    } catch (error) {
      console.warn('Failed to fetch USD rate from CoinGecko, using fallback:', error.message);
    }

    // Fallback: 1 USD ≈ 90 RUB
    const fallbackRubPerUsd = 90;
    return amountUSD * fallbackRubPerUsd;
  }

  

  async createInvoice(amount, payloadMeta, asset) {
    try {
      // Convert RUB amount to USD amount first
      const usdAmount = await this.convertRUBToUSD(amount);

      const requestData = {
        amount: usdAmount.toString(),
        description: `Пополнение баланса на ${amount} ₽`,
        hidden_message: JSON.stringify(payloadMeta, (key, value) => typeof value === 'bigint' ? value.toString() : value),
        paid_btn_name: 'openBot',
        paid_btn_url: `https://t.me/${normalizeBotUsername(config.BOT_USERNAME)}`,
        allow_comments: false,
        allow_anonymous: false,
        expires_in: 3600
      };

      // Only add asset if specified, otherwise let user choose in CryptoBot
      if (asset) {
        requestData.asset = asset;
      }

      const response = await axios.post(`${this.apiUrl}/createInvoice`, requestData, {
        headers: {
          'Crypto-Pay-API-Token': this.token,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data.ok) {
        return {
          invoiceId: response.data.result.invoice_id,
          payUrl: response.data.result.pay_url
        };
      } else {
        throw new Error(`CryptoBot API error: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Error creating invoice:', error.message);
      if (error.response && error.response.data) {
        console.error('API Error details:', error.response.data);
      }
      throw error;
    }
  }

  async getInvoiceStatus(invoiceId) {
    try {
      const response = await axios.get(`${this.apiUrl}/getInvoices?invoice_ids=${invoiceId}`, {
        headers: {
          'Crypto-Pay-API-Token': this.token
        },
        timeout: 10000
      });

      if (response.data.ok && response.data.result.items.length > 0) {
        const invoice = response.data.result.items[0];
        return {
          status: invoice.status,
          amount: parseFloat(invoice.amount),
          asset: invoice.asset
        };
      } else {
        throw new Error(`Invoice not found: ${invoiceId}`);
      }
    } catch (error) {
      console.error('Error getting invoice status:', error.message);
      throw error;
    }
  }

  async getBalance(asset = null) {
    try {
      const url = asset ? `${this.apiUrl}/getBalance?asset=${asset}` : `${this.apiUrl}/getBalance`;
      const response = await axios.get(url, {
        headers: {
          'Crypto-Pay-API-Token': this.token
        },
        timeout: 10000
      });

      if (response.data.ok) {
        if (asset) {
          return response.data.result[asset] || 0;
        } else {
          // Return all balances
          return response.data.result;
        }
      } else {
        throw new Error(`CryptoBot API error: ${response.data.error}`);
      }
    } catch (error) {
      console.error('Error getting balance:', error.message);
      throw error;
    }
  }

  async createTransfer(amount, to, asset = 'USDT') {
    // Crypto Pay API transfers work for Crypto Bot users, not external blockchain addresses.
    // For external address payouts, implement a proper on-chain payout provider and call it here.
    throw new Error("createTransfer is not implemented for external addresses. Use manual payout or интегрируйте on-chain провайдера.");
  }

  async getTransferStatus(transferId) {
    // Handle test transfer IDs for development
    if (transferId.startsWith('test_')) {
      console.warn('Using simulated transfer status for test ID - REMOVE IN PRODUCTION');
      return {
        status: 'paid',
        amount: 0, // Not used in verification
        asset: 'USDT'
      };
    }

    try {
      const response = await axios.get(`${this.apiUrl}/getTransfers?transfer_ids=${transferId}`, {
        headers: {
          'Crypto-Pay-API-Token': this.token
        },
        timeout: 10000
      });

      if (response.data.ok && response.data.result.items.length > 0) {
        const transfer = response.data.result.items[0];
        return {
          status: transfer.status,
          amount: parseFloat(transfer.amount),
          asset: transfer.asset
        };
      } else {
        throw new Error(`Transfer not found: ${transferId}`);
      }
    } catch (error) {
      console.error('Error getting transfer status:', error.message);
      throw error;
    }
  }
}

module.exports = new CryptoBot();
