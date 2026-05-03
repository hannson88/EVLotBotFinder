'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { createBot } = require('./bot');
const { runPollCycle } = require('./poller');

const BOT_TOKEN = process.env.BOT_TOKEN;
const LTA_ACCOUNT_KEY = process.env.LTA_ACCOUNT_KEY;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MINUTES || 5);

const missingVars = [];
if (!BOT_TOKEN) missingVars.push('BOT_TOKEN');
if (!LTA_ACCOUNT_KEY) missingVars.push('LTA_ACCOUNT_KEY');
if (!ADMIN_CHAT_ID) missingVars.push('ADMIN_CHAT_ID');

if (missingVars.length > 0) {
  console.error(`ERROR: Missing required environment variable(s): ${missingVars.join(', ')}`);
  process.exit(1);
}

if (!Number.isInteger(Number(ADMIN_CHAT_ID))) {
  console.error('ERROR: ADMIN_CHAT_ID must be a numeric Telegram chat ID');
  process.exit(1);
}

if (!Number.isInteger(POLL_INTERVAL) || POLL_INTERVAL < 1) {
  console.error('ERROR: POLL_INTERVAL_MINUTES must be a positive whole number');
  process.exit(1);
}

let isPolling = false;

async function runGuardedPoll(bot, label) {
  if (isPolling) {
    console.warn(`[${label}] Poll skipped because previous cycle is still running`);
    return;
  }

  isPolling = true;
  try {
    await runPollCycle(bot);
  } finally {
    isPolling = false;
  }
}

async function main() {
  const bot = await createBot(BOT_TOKEN);

  // Run an initial poll on startup to populate the lots catalog and establish
  // baseline availability states. No notifications are sent on this first run.
  runGuardedPoll(bot, 'startup')
    .then(() => console.log('[startup] Initial poll complete'))
    .catch(err => console.error('[startup] Initial poll failed:', err.message));

  // Schedule recurring polls
  cron.schedule(`*/${POLL_INTERVAL} * * * *`, async () => {
    console.log(`[cron] Poll cycle starting at ${new Date().toISOString()}`);
    await runGuardedPoll(bot, 'cron');
  });

  bot.launch()
    .then(() => console.log('[bot] LotBot is running'))
    .catch(err => {
      console.error('[bot] Failed to launch:', err.message);
      process.exit(1);
    });

  // Set up shutdown handlers
  process.once('SIGINT',  () => { console.log('Shutting down...'); bot.stop('SIGINT'); });
  process.once('SIGTERM', () => { console.log('Shutting down...'); bot.stop('SIGTERM'); });
}

main().catch(err => {
  console.error('Failed to start application:', err.message);
  process.exit(1);
});
