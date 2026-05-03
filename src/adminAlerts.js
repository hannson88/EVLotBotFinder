'use strict';

const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const THROTTLE_MS = 30 * 60 * 1000;
const lastSentByKey = new Map();

async function sendAdminAlert(bot, key, message) {
  if (!bot?.telegram || !Number.isInteger(ADMIN_CHAT_ID)) return;

  const now = Date.now();
  const lastSent = lastSentByKey.get(key) || 0;
  if (now - lastSent < THROTTLE_MS) return;

  lastSentByKey.set(key, now);

  try {
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, message);
  } catch (err) {
    console.error(`[admin-alert] Failed to send ${key}: ${err.message}`);
  }
}

module.exports = { sendAdminAlert };
