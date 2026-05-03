'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeAvailabilityWithCounts, getPriceInfo } = require('../src/poller');

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
