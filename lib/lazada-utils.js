const DEFAULT_RANGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ensureDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeRange(fromInput, toInput) {
  const now = new Date();
  const toDate = ensureDate(toInput) || now;
  const fromDate = ensureDate(fromInput) || new Date(toDate.getTime() - (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY);

  if (fromDate > toDate) {
    const tmp = new Date(fromDate);
    fromDate.setTime(toDate.getTime());
    toDate.setTime(tmp.getTime());
  }

  const normalizedFrom = new Date(Date.UTC(
    fromDate.getUTCFullYear(),
    fromDate.getUTCMonth(),
    fromDate.getUTCDate(),
    0, 0, 0, 0
  ));

  const normalizedTo = new Date(Date.UTC(
    toDate.getUTCFullYear(),
    toDate.getUTCMonth(),
    toDate.getUTCDate(),
    23, 59, 59, 999
  ));

  return {
    from: normalizedFrom.toISOString(),
    to: normalizedTo.toISOString()
  };
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toCurrency(value, fallback = 0) {
  const num = toNumber(value, fallback);
  const rounded = Math.round(num * 100) / 100;
  return Number.isFinite(rounded) ? rounded : fallback;
}

function coerceDate(value) {
  const date = ensureDate(value);
  return date ? date.toISOString() : null;
}

module.exports = {
  ensureDate,
  normalizeRange,
  toNumber,
  toCurrency,
  coerceDate
};
