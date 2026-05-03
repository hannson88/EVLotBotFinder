'use strict';

// Pick a venue from search results — one button per unique location_name
function searchResultsKeyboard(lots, action, labelForLot = lot => lot.location_name || lot.name) {
  const seen = new Set();
  const rows = [];
  for (const lot of lots) {
    const locationName = lot.location_name || lot.name;
    if (seen.has(locationName)) continue;
    seen.add(locationName);
    // Use lot id in callback — avoids length issues with long location names
    rows.push([{ text: `📍 ${labelForLot(lot)}`, callback_data: `pick_venue:${action}:id:${lot.id}` }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

// Confirm or cancel a subscription (uses lot id throughout — avoids name-length issues)
function confirmSubscribeKeyboard(lotId, chargeType) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Confirm', style: 'success', callback_data: `confirm_sub:${chargeType}:id:${lotId}` },
          { text: '❌ Cancel',  style: 'danger',  callback_data: 'cancel_sub' },
        ],
        [{ text: '🔙 Back', callback_data: `pick_venue:subscribe:id:${lotId}` }],
      ],
    },
  };
}

// List subscriptions with unsubscribe buttons.
// Each sub must have: display (button label), charge_type, lot_id (DB id)
function subscriptionListKeyboard(subscriptions) {
  const rows = subscriptions.map(sub => [{
    text: `🔕 ${sub.display}`,
    callback_data: `unsub:${sub.charge_type}:id:${sub.lot_id}`,
  }]);

  rows.push([{ text: '❌ Cancel', style: 'danger', callback_data: 'cancel_unsub' }]);

  return {
    reply_markup: {
      inline_keyboard: rows,
    },
  };
}

function requestLocationKeyboard() {
  return {
    reply_markup: {
      keyboard: [[{ text: 'Share my location', request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function nearbyResultsKeyboard(venues, sortMode, chargeFilter, labelForVenue) {
  const rows = [];
  for (let i = 0; i < venues.length; i++) {
    rows.push([{
      text: labelForVenue(venues[i], i),
      callback_data: `pick_venue:subscribe:id:${venues[i].id}`,
    }]);
  }

  rows.push([
    { text: chargeFilter === 'all' ? '✓ All' : 'All', callback_data: 'nearby_filter:all' },
    { text: chargeFilter === 'ac' ? '✓ AC' : 'AC', callback_data: 'nearby_filter:ac' },
    { text: chargeFilter === 'dc' ? '✓ DC' : 'DC', callback_data: 'nearby_filter:dc' },
  ]);

  rows.push([
    { text: sortMode === 'nearest' ? '✓ Nearest' : 'Nearest', callback_data: 'nearby_sort:nearest' },
    { text: sortMode === 'chance' ? '✓ Chance' : 'Chance', callback_data: 'nearby_sort:chance' },
    { text: sortMode === 'cheapest' ? '✓ Cheapest' : 'Cheapest', callback_data: 'nearby_sort:cheapest' },
  ]);

  return { reply_markup: { inline_keyboard: rows } };
}

module.exports = {
  searchResultsKeyboard,
  confirmSubscribeKeyboard,
  subscriptionListKeyboard,
  requestLocationKeyboard,
  nearbyResultsKeyboard
};
