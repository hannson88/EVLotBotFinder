'use strict';

const { Telegraf } = require('telegraf');
const db = require('./db');
const kb = require('./keyboards');

const { operatorLabel } = require('./operators');
const {
  findNearbyVenues,
  chargeFilterLabel,
  formatNearbyButtonLabel,
  formatNearbyVenueLine,
  normalizeChargeFilter,
  normalizeSortMode,
  sortModeLabel,
} = require('./nearby');

const WELCOME_MESSAGE =
  `Welcome to 🚙 <b>EVLotBot</b>! Find available EV charging spots and get notified when they become available.\n\n` +
  `<b>Commands:</b>\n` +
  `🔍 Type in <b>name / address / postal code</b> to search\n` +
  `📍 /nearby — Chargers near you\n` +
  `🔔 /subs — Subscriptions`;

const userCooldowns = new Map();
const COOLDOWN_MS = 2000;
const ADMIN_CHAT_ID = parseInt(process.env.ADMIN_CHAT_ID, 10);
const NEARBY_RADIUS_KM = 3;
const NEARBY_LIMIT = 10;
const NEARBY_CACHE_MS = 10 * 60 * 1000;
const nearbySearches = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRateLimited(chatId) {
  if (chatId === ADMIN_CHAT_ID) return false;
  const now = Date.now();
  const last = userCooldowns.get(chatId) ?? 0;
  if (now - last < COOLDOWN_MS) return true;
  userCooldowns.set(chatId, now);
  return false;
}

function cacheNearbySearch(chatId, latitude, longitude) {
  nearbySearches.set(chatId, {
    latitude,
    longitude,
    sortMode: 'nearest',
    chargeFilter: 'all',
    createdAt: Date.now(),
  });
}

function getCachedNearbySearch(chatId) {
  const cached = nearbySearches.get(chatId);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > NEARBY_CACHE_MS) {
    nearbySearches.delete(chatId);
    return null;
  }
  return cached;
}

async function createBot(token) {
  const bot = new Telegraf(token);

  // Register commands with Telegram (only if token is valid)
  try {
    await bot.telegram.setMyCommands([
      { command: 'start',           description: '👋 Welcome' },
      { command: 'nearby',          description: '📍 Nearby chargers' },
      { command: 'subs',            description: '🔔 Subscriptions' },
    ]);
    console.log('[bot] Commands registered with Telegram');
  } catch (err) {
    console.warn('[bot] Could not register commands with Telegram:', err.message);
  }

  // ── /start ────────────────────────────────────────────────────────────────
  bot.start(ctx => ctx.reply(WELCOME_MESSAGE, { parse_mode: 'HTML' }));

  // ── /subs ─────────────────────────────────────────────────────────────────
  bot.command('subs', ctx => {
    const subs = db.getSubscriptionsByChatId(ctx.chat.id);
    if (subs.length === 0) {
      return ctx.reply('You have no active subscriptions.\nType a name, address or postal code to search for a lot.');
    }
    const enriched = subs.map(sub => {
      const loc = sub.location_name || sub.lot_name.split('|||')[0];
      const op  = operatorLabel(sub.operator || sub.lot_name.split('|||')[1] || '');
      return { ...sub, display: `${loc} | ${op} (${sub.charge_type})` };
    });
    return ctx.reply('Your subscriptions (tap to unsubscribe):', kb.subscriptionListKeyboard(enriched));
  });

  // ── /nearby ───────────────────────────────────────────────────────────────
  bot.command('nearby', ctx => {
    return ctx.reply(
      `Share your current location to find chargers within ${NEARBY_RADIUS_KM} km.`,
      kb.requestLocationKeyboard()
    );
  });

  // ── Admin commands ────────────────────────────────────────────────────────
  bot.command('admin', ctx => {
    if (ctx.chat.id !== ADMIN_CHAT_ID) return;
    return ctx.reply(
      `<b>Admin commands</b>\n\n` +
      `/admin — List all admin commands\n` +
      `/adminsettings — View current subscription limits and total count\n` +
      `/adminsubs — List subscriptions grouped by lot\n` +
      `/setmaxsubs &lt;n&gt; — Set global subscription limit\n` +
      `/setmaxperuser &lt;n&gt; — Set per-user subscription limit`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('setmaxsubs', ctx => {
    if (ctx.chat.id !== ADMIN_CHAT_ID) return;
    const arg = parseInt(ctx.message.text.split(' ')[1], 10);
    if (isNaN(arg) || arg < 1) return ctx.reply('Usage: /setmaxsubs <number>');
    db.setSetting('max_subs_global', arg);
    return ctx.reply(`Global subscription limit set to ${arg}.`);
  });

  bot.command('setmaxperuser', ctx => {
    if (ctx.chat.id !== ADMIN_CHAT_ID) return;
    const arg = parseInt(ctx.message.text.split(' ')[1], 10);
    if (isNaN(arg) || arg < 1) return ctx.reply('Usage: /setmaxperuser <number>');
    db.setSetting('max_subs_per_user', arg);
    return ctx.reply(`Per-user subscription limit set to ${arg}.`);
  });

  bot.command('adminsubs', ctx => {
    if (ctx.chat.id !== ADMIN_CHAT_ID) return;
    const rows = db.getSubscriptionsByLot();
    const total = db.getTotalSubscriptionCount();
    if (rows.length === 0) return ctx.reply('No active subscriptions.');
    const lines = [`<b>Subscriptions by lot</b> (total: ${total})\n`];
    for (const r of rows) {
      const loc = r.location_name || r.lot_name.split('|||')[0];
      const op  = r.operator ? ` | ${operatorLabel(r.operator)}` : '';
      lines.push(`${r.cnt}× ${escapeHtml(loc)}${escapeHtml(op)} (${r.charge_type})`);
    }
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('adminsettings', ctx => {
    if (ctx.chat.id !== ADMIN_CHAT_ID) return;
    const maxGlobal  = db.getSetting('max_subs_global',  150);
    const maxPerUser = db.getSetting('max_subs_per_user', 3);
    const totalSubs  = db.getTotalSubscriptionCount();
    return ctx.reply(
      `Admin settings:\n` +
      `• Global limit: ${maxGlobal} (current: ${totalSubs})\n` +
      `• Per-user limit: ${maxPerUser}`
    );
  });

  // ── Free-text search ───────────────────────────────────────────────────────
  bot.on('text', ctx => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    if (isRateLimited(ctx.chat.id)) return;
    const query = text.trim();
    const lots = db.searchLots(query);
    if (lots.length === 0) {
      return ctx.reply('No lots found. Try a different keyword.');
    }
    return ctx.reply('Select to view details:', kb.searchResultsKeyboard(lots, 'subscribe'));
  });

  // ── Shared location search ────────────────────────────────────────────────
  bot.on('location', async ctx => {
    if (isRateLimited(ctx.chat.id)) return;

    const { latitude, longitude } = ctx.message.location;
    cacheNearbySearch(ctx.chat.id, latitude, longitude);
    await ctx.reply('Searching nearby chargers...', { reply_markup: { remove_keyboard: true } });
    return sendNearbyResults(ctx, latitude, longitude, 'nearest', 'all');
  });

  function updateCachedNearbySearch(chatId, updates) {
    const cached = getCachedNearbySearch(chatId);
    if (!cached) return null;
    const updated = { ...cached, ...updates, createdAt: Date.now() };
    nearbySearches.set(chatId, updated);
    return updated;
  }

  function buildNearbyResults(latitude, longitude, sortMode, chargeFilter) {
    const venues = db.getVenueLocationsWithCoordinates();
    return findNearbyVenues(venues, latitude, longitude, NEARBY_RADIUS_KM, NEARBY_LIMIT, sortMode, chargeFilter);
  }

  function formatNearbyResultsMessage(nearby, sortMode, chargeFilter) {
    const lines = [
      `<b>Nearby chargers within ${NEARBY_RADIUS_KM} km</b>`,
      `Type: ${chargeFilterLabel(chargeFilter)} · Sorted by: ${sortModeLabel(sortMode)}`,
      '',
      ...nearby.map((venue, index) => formatNearbyVenueLine(venue, index, chargeFilter)),
      '',
      'Tap a result to view details.',
    ];

    return lines.join('\n');
  }

  function nearbyReplyOptions(nearby, sortMode, chargeFilter) {
    return {
      parse_mode: 'HTML',
      ...kb.nearbyResultsKeyboard(
        nearby,
        sortMode,
        chargeFilter,
        (venue, index) => formatNearbyButtonLabel(venue, index, chargeFilter)
      ),
    };
  }

  function sendNearbyResults(ctx, latitude, longitude, rawSortMode, rawChargeFilter) {
    const sortMode = normalizeSortMode(rawSortMode);
    const chargeFilter = normalizeChargeFilter(rawChargeFilter);
    const nearby = buildNearbyResults(latitude, longitude, sortMode, chargeFilter);

    if (nearby.length === 0) {
      return ctx.reply(
        `No ${chargeFilterLabel(chargeFilter)} chargers found within ${NEARBY_RADIUS_KM} km of your location.`,
        { reply_markup: { remove_keyboard: true } }
      );
    }

    return ctx.reply(formatNearbyResultsMessage(nearby, sortMode, chargeFilter), nearbyReplyOptions(nearby, sortMode, chargeFilter));
  }

  function editNearbyResults(ctx, latitude, longitude, rawSortMode, rawChargeFilter) {
    const sortMode = normalizeSortMode(rawSortMode);
    const chargeFilter = normalizeChargeFilter(rawChargeFilter);
    const nearby = buildNearbyResults(latitude, longitude, sortMode, chargeFilter);

    if (nearby.length === 0) {
      return ctx.editMessageText(`No ${chargeFilterLabel(chargeFilter)} chargers found within ${NEARBY_RADIUS_KM} km of your location.`);
    }

    return ctx.editMessageText(formatNearbyResultsMessage(nearby, sortMode, chargeFilter), nearbyReplyOptions(nearby, sortMode, chargeFilter));
  }

  bot.action(/^nearby_sort:(nearest|chance|cheapest)$/, ctx => {
    const cached = updateCachedNearbySearch(ctx.chat.id, { sortMode: ctx.match[1] });
    if (!cached) {
      return ctx.answerCbQuery('Please share your location again.', { show_alert: true });
    }

    ctx.answerCbQuery();
    return editNearbyResults(ctx, cached.latitude, cached.longitude, cached.sortMode, cached.chargeFilter);
  });

  bot.action(/^nearby_filter:(all|ac|dc)$/, ctx => {
    const cached = updateCachedNearbySearch(ctx.chat.id, { chargeFilter: ctx.match[1] });
    if (!cached) {
      return ctx.answerCbQuery('Please share your location again.', { show_alert: true });
    }

    ctx.answerCbQuery();
    return editNearbyResults(ctx, cached.latitude, cached.longitude, cached.sortMode, cached.chargeFilter);
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatTimeAgo(unixSecs) {
    if (!unixSecs) return null;
    const diffSecs = Math.floor(Date.now() / 1000) - unixSecs;
    if (diffSecs < 60)   return `${diffSecs}s ago`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return `${Math.floor(diffSecs / 86400)}d ago`;
  }

  function formatTime(unixSecs) {
    if (!unixSecs) return null;
    return new Date(unixSecs * 1000).toLocaleTimeString('en-SG', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore',
    });
  }

  // ── Callback: user picks a venue from search results ─────────────────────
  bot.action(/^pick_venue:subscribe:(.+)$/, ctx => {
    const param = ctx.match[1];
    let lotsAtVenue = [];
    let locationName = '';

    if (!param.startsWith('id:')) 
      return ctx.editMessageText(`Invalid details. Please try again shortly.`, { parse_mode: 'HTML' });

    lotsAtVenue  = db.getLotsByLotId(parseInt(param.slice(3), 10));
    locationName = lotsAtVenue[0]?.location_name || param;

    const lotsWithData = lotsAtVenue.filter(l => l.has_ac || l.has_dc);
    if (lotsWithData.length === 0)
      return ctx.editMessageText(`No charger data available for <b>${escapeHtml(locationName)}</b> yet. Please try again shortly.`, { parse_mode: 'HTML' });

    const lat = lotsAtVenue[0]?.latitude;
    const lon = lotsAtVenue[0]?.longitude;
    const mapsUrl = lat && lon ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : null;
    const lines = [`📍 <b>${escapeHtml(locationName)}</b>`];
    const address = lotsAtVenue[0]?.address;
    if (address) {
      const addressDisplay = mapsUrl
        ? `<a href="${escapeHtml(mapsUrl)}">${escapeHtml(address)}</a>`
        : escapeHtml(address);
      lines.push(`🏢 ${addressDisplay}`);
    }
    lines.push('');

    const buttonRows = [];
    for (const lot of lotsWithData) {
      const opLabel = operatorLabel(lot.operator) || lot.location_name || lot.name;
      lines.push(`🔌 <b>${escapeHtml(opLabel)}</b>`);

      if (lot.has_ac) {
        const avail = lot.ac_available_count ?? 0;
        const acStr = lot.ac_total > 0
          ? (avail > 0 ? `✅ ${avail}/${lot.ac_total} available` : `❌ 0/${lot.ac_total} available`)
          : (lot.ac_available ? '✅ Available' : '❌ Unavailable');
        const acCost = lot.ac_price ? ` · ${escapeHtml(lot.ac_price)}` : '';
        lines.push(`  ⚡ AC — ${acStr}${acCost}`);
      }
      if (lot.has_dc) {
        const avail = lot.dc_available_count ?? 0;
        const dcStr = lot.dc_total > 0
          ? (avail > 0 ? `✅ ${avail}/${lot.dc_total} available` : `❌ 0/${lot.dc_total} available`)
          : (lot.dc_available ? '✅ Available' : '❌ Unavailable');
        const dcCost = lot.dc_price ? ` · ${escapeHtml(lot.dc_price)}` : '';
        lines.push(`  🔋 DC — ${dcStr}${dcCost}`);
      }
      lines.push('');

      const row = [];
      if (lot.has_ac && !lot.ac_available_count) row.push({ text: `⚡ ${opLabel} — AC`, style: 'success', callback_data: `subscribe:AC:id:${lot.id}` });
      if (lot.has_dc && !lot.dc_available_count) row.push({ text: `🔋 ${opLabel} — DC`, style: 'success', callback_data: `subscribe:DC:id:${lot.id}` });
      if (row.length) buttonRows.push(row);
    }

    const globalLastUpdated = db.getLastUpdatedTime();
    const timeStr = globalLastUpdated
      ? `${formatTime(globalLastUpdated)} (${formatTimeAgo(globalLastUpdated)})`
      : 'Unknown';
    lines.push(`🕐 <i>Last updated: ${timeStr}</i>`);
    lines.push('');
    if (buttonRows.length) {
      lines.push('Subscribe to alerts:');
      buttonRows.push([{ text: '❌ Cancel', style: 'danger', callback_data: 'cancel_sub' }]);
    }
    return ctx.editMessageText(lines.join('\n'), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttonRows },
    });
  });

  // ── Callback: user picks AC or DC → subscribe immediately ────────────────
  bot.action(/^subscribe:(AC|DC):(.+)$/, ctx => {
    if (isRateLimited(ctx.chat.id)) return ctx.answerCbQuery();
    const chargeType = ctx.match[1];
    const param      = ctx.match[2];
    const lot        = param.startsWith('id:')
      ? db.getLotById(parseInt(param.slice(3), 10))
      : db.getLotByName(param); // legacy fallback

    if (!lot)
      return ctx.editMessageText('Lot not found.');

    const locName = lot.location_name || lot.name;
    const opLabel = lot.operator ? operatorLabel(lot.operator) : null;

    const maxGlobal  = db.getSetting('max_subs_global',  150);
    const maxPerUser = db.getSetting('max_subs_per_user', 3);

    if (ctx.chat.id !== ADMIN_CHAT_ID) {
      if (db.getTotalSubscriptionCount() >= maxGlobal) {
        return ctx.answerCbQuery('Subscription limit reached. Please try again later.', { show_alert: true });
      }
      if (db.getSubscriptionCountByChatId(ctx.chat.id) >= maxPerUser) {
        return ctx.answerCbQuery('You have reached the maximum number of subscriptions. Please remove existing ones first.', { show_alert: true });
      }
    }

    db.addSubscription(ctx.chat.id, lot.name, chargeType);

    const lines = [
      `Subscribed! You'll be notified when the charger becomes available.`,
      '',
      `<b>Location:</b> ${escapeHtml(locName)}`,
    ];
    if (opLabel) lines.push(`<b>Operator:</b> ${escapeHtml(opLabel)}`);
    lines.push(`<b>Type:</b> ${chargeType}`);
    lines.push('', 'Use /subs to manage your alerts.');

    ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML' });
    return ctx.answerCbQuery('Subscribed!');
  });

  // ── Callback: cancel subscription flow ────────────────────────────────────
  bot.action('cancel_sub', ctx => {
    return ctx.editMessageText('Cancelled.');
  });

  bot.action('cancel_unsub', ctx => {
    return ctx.editMessageText('Cancelled.');
  });

  // ── Callback: unsubscribe ─────────────────────────────────────────────────
  bot.action(/^unsub:(AC|DC):(.+)$/, ctx => {
    const chargeType = ctx.match[1];
    const param      = ctx.match[2];
    const lot        = param.startsWith('id:')
      ? db.getLotById(parseInt(param.slice(3), 10))
      : db.getLotByName(param); // legacy fallback

    const lotName = lot?.name || param;

    db.removeSubscription(ctx.chat.id, lotName, chargeType);

    const subs = db.getSubscriptionsByChatId(ctx.chat.id);
    const enriched = subs.map(sub => {
      const loc = sub.location_name || sub.lot_name.split('|||')[0];
      const op  = operatorLabel(sub.operator || sub.lot_name.split('|||')[1] || '');
      return { ...sub, display: `${loc} | ${op} (${sub.charge_type})` };
    });
    const lines = [
      `Unsubscribed from <b>${chargeType}</b> alerts.`,
      '',
      `Your subscriptions (tap to unsubscribe):`,
    ];

    return ctx.editMessageText(
      subs.length > 0
        ? lines.join('\n')
        : `Unsubscribed from <b>${chargeType}</b> alerts.\n\nYou have no active subscriptions.`,
      {
        parse_mode: 'HTML',
        ...kb.subscriptionListKeyboard(enriched),
      }
    );
  });

  // ── Callback: noop (operator header rows in search results) ──────────────
  bot.action('noop', ctx => ctx.answerCbQuery());

  // Catch-all for unknown slash commands
  bot.on('text', ctx => {
    if (ctx.message.text.startsWith('/')) {
      ctx.reply('Unknown command. Use /subs to manage subscriptions, or type a name to search.');
    }
  });

  return bot;
}

module.exports = { createBot };
