'use strict';

const { operatorLabel } = require('./operators');

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeChargeFilter(chargeFilter) {
  return ['all', 'ac', 'dc'].includes(chargeFilter) ? chargeFilter : 'all';
}

function getAvailableCount(venue, chargeFilter = 'all') {
  const filter = normalizeChargeFilter(chargeFilter);
  if (filter === 'ac') return venue.ac_available_count || 0;
  if (filter === 'dc') return venue.dc_available_count || 0;
  return (venue.ac_available_count || 0) + (venue.dc_available_count || 0);
}

function getTotalCount(venue, chargeFilter = 'all') {
  const filter = normalizeChargeFilter(chargeFilter);
  if (filter === 'ac') return venue.ac_total || 0;
  if (filter === 'dc') return venue.dc_total || 0;
  return (venue.ac_total || 0) + (venue.dc_total || 0);
}

function getAvailabilityRatio(venue, chargeFilter = 'all') {
  const total = getTotalCount(venue, chargeFilter);
  if (total <= 0) return 0;
  return getAvailableCount(venue, chargeFilter) / total;
}

function hasChargeType(venue, chargeFilter = 'all') {
  const filter = normalizeChargeFilter(chargeFilter);
  if (filter === 'all') return getTotalCount(venue, 'all') > 0;
  return getTotalCount(venue, filter) > 0;
}

function compareNearbyVenues(sortMode, chargeFilter = 'all') {
  return (a, b) => {
    if (sortMode === 'chance') {
      return getAvailabilityRatio(b, chargeFilter) - getAvailabilityRatio(a, chargeFilter) ||
        getAvailableCount(b, chargeFilter) - getAvailableCount(a, chargeFilter) ||
        a.distance_km - b.distance_km;
    }

    if (sortMode === 'cheapest') {
      const aPrice = getLowestPrice(a.price_info);
      const bPrice = getLowestPrice(b.price_info);

      if (aPrice === null && bPrice !== null) return 1;
      if (aPrice !== null && bPrice === null) return -1;
      if (aPrice !== null && bPrice !== null && aPrice !== bPrice) return aPrice - bPrice;

      return a.distance_km - b.distance_km;
    }

    return a.distance_km - b.distance_km;
  };
}

function findNearbyVenues(venues, latitude, longitude, radiusKm, limit, sortMode = 'nearest', chargeFilter = 'all') {
  const filter = normalizeChargeFilter(chargeFilter);
  return venues
    .map(venue => ({
      ...venue,
      distance_km: distanceKm(latitude, longitude, venue.latitude, venue.longitude),
    }))
    .filter(venue => venue.distance_km <= radiusKm)
    .filter(venue => hasChargeType(venue, filter))
    .sort(compareNearbyVenues(sortMode, filter))
    .slice(0, limit);
}

function getLowestPrice(priceInfo) {
  const matches = String(priceInfo || '').match(/\$?(\d+(?:\.\d+)?)/g);
  if (!matches) return null;

  return matches
    .map(match => Number(match.replace('$', '')))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? null;
}

function formatLowestPrice(priceInfo) {
  const lowest = getLowestPrice(priceInfo);
  if (lowest === null) return null;
  return `$${lowest}/kWh`;
}

function formatAvailabilitySummary(venue, chargeFilter = 'all') {
  const filter = normalizeChargeFilter(chargeFilter);
  const parts = [];

  if ((filter === 'all' || filter === 'ac') && venue.ac_total > 0) {
    parts.push(`AC ${venue.ac_available_count || 0}/${venue.ac_total}`);
  }

  if ((filter === 'all' || filter === 'dc') && venue.dc_total > 0) {
    parts.push(`DC ${venue.dc_available_count || 0}/${venue.dc_total}`);
  }

  return parts.length ? parts.join(' ') : 'No live count';
}

function formatNearbyVenueDetails(venue, chargeFilter = 'all') {
  return [
    `${venue.distance_km.toFixed(1)} km`,
    formatAvailabilitySummary(venue, chargeFilter),
    formatLowestPrice(venue.price_info),
  ].filter(Boolean);
}

function formatShortName(name, maxLength = 16) {
  if (!name || name.length <= maxLength) return name || 'Unknown';
  return `${name.slice(0, maxLength - 1).trim()}…`;
}

function formatOpenSummary(venue, chargeFilter = 'all') {
  const filter = normalizeChargeFilter(chargeFilter);
  const parts = [];

  if ((filter === 'all' || filter === 'ac') && (venue.ac_available_count || 0) > 0) {
    parts.push(`AC ${venue.ac_available_count}`);
  }

  if ((filter === 'all' || filter === 'dc') && (venue.dc_available_count || 0) > 0) {
    parts.push(`DC ${venue.dc_available_count}`);
  }

  return parts.length ? parts.join(' ') : '0 open';
}

function formatNearbyButtonLabel(venue, index, chargeFilter = 'all') {
  const provider = venue.operator ? operatorLabel(venue.operator) : null;
  const providerText = provider ? ` · ${formatShortName(provider, 10)}` : '';
  return `${index + 1}. ${formatShortName(venue.location_name)}${providerText} · ${formatOpenSummary(venue, chargeFilter)}`;
}

function formatNearbyVenueLine(venue, index, chargeFilter = 'all') {
  const provider = venue.operator ? operatorLabel(venue.operator) : 'Unknown operator';
  return `${index + 1}. ${venue.location_name}\n   ${provider} · ${formatNearbyVenueDetails(venue, chargeFilter).join(' · ')}`;
}

function sortModeLabel(sortMode) {
  if (sortMode === 'chance') return 'Best chance';
  if (sortMode === 'cheapest') return 'Cheapest';
  return 'Nearest';
}

function normalizeSortMode(sortMode) {
  return ['nearest', 'chance', 'cheapest'].includes(sortMode) ? sortMode : 'nearest';
}

function chargeFilterLabel(chargeFilter) {
  const filter = normalizeChargeFilter(chargeFilter);
  if (filter === 'ac') return 'AC';
  if (filter === 'dc') return 'DC';
  return 'All';
}

module.exports = {
  distanceKm,
  findNearbyVenues,
  getLowestPrice,
  getAvailableCount,
  getAvailabilityRatio,
  formatAvailabilitySummary,
  formatOpenSummary,
  formatNearbyButtonLabel,
  formatNearbyVenueLine,
  normalizeChargeFilter,
  normalizeSortMode,
  chargeFilterLabel,
  sortModeLabel,
};
