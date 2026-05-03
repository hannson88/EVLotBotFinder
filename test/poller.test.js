'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeAvailabilityWithCounts, getPriceInfo } = require('../src/poller');
const {
  distanceKm,
  findNearbyVenues,
  getLowestPrice,
  getAvailableCount,
  getAvailabilityRatio,
  formatAvailabilitySummary,
  formatOpenSummary,
  formatNearbyButtonLabel,
  formatNearbyVenueLine,
} = require('../src/nearby');

test('computeAvailabilityWithCounts counts AC and DC charger availability', () => {
  const points = [
    {
      plugTypes: [
        {
          current: 'AC',
          evIds: [{ status: '1' }, { status: '0' }],
        },
        {
          current: 'DC',
          evIds: [{ status: '1' }],
        },
      ],
    },
    {
      plugTypes: [
        {
          current: 'AC',
          evIds: [{ status: '1' }],
        },
      ],
    },
  ];

  assert.deepEqual(computeAvailabilityWithCounts(points), {
    AC: { available: 2, total: 3 },
    DC: { available: 1, total: 1 },
  });
});

test('computeAvailabilityWithCounts ignores unsupported charger currents', () => {
  const points = [
    {
      plugTypes: [
        {
          current: 'UNKNOWN',
          evIds: [{ status: '1' }],
        },
      ],
    },
  ];

  assert.deepEqual(computeAvailabilityWithCounts(points), {
    AC: { available: 0, total: 0 },
    DC: { available: 0, total: 0 },
  });
});

test('getPriceInfo formats a single price for a charger type', () => {
  const points = [
    {
      plugTypes: [
        {
          current: 'AC',
          price: '0.67',
          priceType: 'kWh',
        },
      ],
    },
  ];

  assert.equal(getPriceInfo(points, 'AC'), '$0.67/kWh');
});

test('getPriceInfo formats a price range for a charger type', () => {
  const points = [
    {
      plugTypes: [
        {
          current: 'AC',
          price: '0.83',
          priceType: 'kWh',
        },
      ],
    },
    {
      plugTypes: [
        {
          current: 'AC',
          price: '0.67',
          priceType: 'kWh',
        },
      ],
    },
  ];

  assert.equal(getPriceInfo(points, 'AC'), '$0.67–$0.83/kWh');
});

test('getPriceInfo returns null when no matching price exists', () => {
  const points = [
    {
      plugTypes: [
        {
          current: 'DC',
          price: '0.90',
          priceType: 'kWh',
        },
      ],
    },
  ];

  assert.equal(getPriceInfo(points, 'AC'), null);
});

test('distanceKm calculates distance between nearby coordinates', () => {
  const distance = distanceKm(1.3521, 103.8198, 1.3000, 103.8000);

  assert.equal(Math.round(distance), 6);
});

test('findNearbyVenues filters, sorts, and limits venues by radius', () => {
  const venues = [
    { id: 1, location_name: 'Far', latitude: 1.45, longitude: 103.9, ac_available_count: 1, ac_total: 1 },
    { id: 2, location_name: 'Nearer', latitude: 1.301, longitude: 103.801, ac_available_count: 1, ac_total: 1 },
    { id: 3, location_name: 'Nearest', latitude: 1.3005, longitude: 103.8005, ac_available_count: 1, ac_total: 1 },
  ];

  const nearby = findNearbyVenues(venues, 1.3, 103.8, 2, 2);

  assert.deepEqual(nearby.map(venue => venue.location_name), ['Nearest', 'Nearer']);
});

test('findNearbyVenues can sort by best chance', () => {
  const venues = [
    { id: 1, location_name: 'More Open', latitude: 1.3001, longitude: 103.8001, ac_available_count: 6, ac_total: 8, dc_available_count: 0, dc_total: 0 },
    { id: 2, location_name: 'Best Chance', latitude: 1.301, longitude: 103.801, ac_available_count: 5, ac_total: 5, dc_available_count: 0, dc_total: 0 },
  ];

  const nearby = findNearbyVenues(venues, 1.3, 103.8, 2, 2, 'chance');

  assert.deepEqual(nearby.map(venue => venue.location_name), ['Best Chance', 'More Open']);
});

test('findNearbyVenues can sort by cheapest', () => {
  const venues = [
    { id: 1, location_name: 'Closer', latitude: 1.3001, longitude: 103.8001, ac_available_count: 1, ac_total: 1, price_info: '$0.83/kWh' },
    { id: 2, location_name: 'Cheaper', latitude: 1.301, longitude: 103.801, ac_available_count: 1, ac_total: 1, price_info: '$0.67/kWh' },
  ];

  const nearby = findNearbyVenues(venues, 1.3, 103.8, 2, 2, 'cheapest');

  assert.deepEqual(nearby.map(venue => venue.location_name), ['Cheaper', 'Closer']);
});

test('findNearbyVenues can filter by DC chargers', () => {
  const venues = [
    { id: 1, location_name: 'AC Only', latitude: 1.3001, longitude: 103.8001, ac_available_count: 1, ac_total: 2, dc_available_count: 0, dc_total: 0 },
    { id: 2, location_name: 'Has DC', latitude: 1.301, longitude: 103.801, ac_available_count: 0, ac_total: 0, dc_available_count: 1, dc_total: 2 },
  ];

  const nearby = findNearbyVenues(venues, 1.3, 103.8, 2, 2, 'nearest', 'dc');

  assert.deepEqual(nearby.map(venue => venue.location_name), ['Has DC']);
});

test('getLowestPrice extracts the cheapest price from combined price info', () => {
  assert.equal(getLowestPrice('$0.83/kWh,$0.67–$0.73/kWh'), 0.67);
});

test('formatAvailabilitySummary includes AC and DC counts', () => {
  assert.equal(formatAvailabilitySummary({
    ac_available_count: 2,
    ac_total: 4,
    dc_available_count: 1,
    dc_total: 2,
  }), 'AC 2/4 DC 1/2');
});

test('getAvailableCount combines AC and DC available counts', () => {
  assert.equal(getAvailableCount({
    ac_available_count: 2,
    dc_available_count: 1,
  }), 3);
});

test('getAvailabilityRatio calculates filtered availability ratio', () => {
  assert.equal(getAvailabilityRatio({
    ac_available_count: 2,
    ac_total: 4,
    dc_available_count: 1,
    dc_total: 1,
  }, 'dc'), 1);
});

test('formatNearbyButtonLabel is short and meaningful', () => {
  assert.equal(formatNearbyButtonLabel({
    location_name: 'Blk 223/226/226A-226D Ang Mo Kio Street 22',
    operator: 'CHARGE+ PTE. LTD.',
    ac_available_count: 5,
    ac_total: 5,
  }, 4, 'ac'), '5. Blk 223/226/226… · Charge+ · AC 5');
});

test('formatOpenSummary shows AC and DC open counts for all chargers', () => {
  assert.equal(formatOpenSummary({
    ac_available_count: 8,
    dc_available_count: 1,
  }, 'all'), 'AC 8 DC 1');
});

test('formatOpenSummary only shows selected charger type', () => {
  assert.equal(formatOpenSummary({
    ac_available_count: 8,
    dc_available_count: 1,
  }, 'dc'), 'DC 1');
});

test('formatNearbyVenueLine includes numbered multiline details', () => {
  assert.equal(formatNearbyVenueLine({
    location_name: 'Maybank Centre',
    operator: 'SP MOBILITY PTE. LTD.',
    distance_km: 0.62,
    ac_available_count: 2,
    ac_total: 4,
    dc_available_count: 0,
    dc_total: 0,
    price_info: '$0.67/kWh',
  }, 0), '1. Maybank Centre\n   SP · 0.6 km · AC 2/4 · $0.67/kWh');
});
