/**
 * React Query cache configuration per data-type.
 *
 * M-3: Different data types have vastly different update frequencies.
 * A single 30-second staleTime is inappropriate — prices change every
 * few seconds during market hours, while company master lists change
 * once a quarter.
 */

/**
 * Check whether NEPSE is currently in trading hours.
 * Market: Sun–Thu, 11:00–15:00 NPT (UTC +5:45).
 */
export function isMarketOpen() {
  const now = new Date();
  // Convert to NPT (UTC+5:45)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const npt = new Date(utc + 5.75 * 3600000);

  const day = npt.getDay(); // 0=Sun, 6=Sat
  const hour = npt.getHours();
  const minute = npt.getMinutes();
  const totalMinutes = hour * 60 + minute;

  // Trading days: Sun(0), Mon(1), Tue(2), Wed(3), Thu(4)
  const isTradingDay = day >= 0 && day <= 4;
  // Trading window: 11:00 – 15:00 NPT
  const isWithinHours = totalMinutes >= 660 && totalMinutes < 900;

  return isTradingDay && isWithinHours;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Recommended staleTime per query-key family.
 */
export const STALE_TIMES = {
  /** Live prices — aggressive during market hours, relaxed after */
  LIVE_PRICES: isMarketOpen() ? 30 * SECOND : 5 * MINUTE,

  /** NEPSE index snapshot */
  NEPSE_INDEX: 60 * SECOND,

  /** Portfolio summary & holdings — changes on transaction mutations */
  PORTFOLIO: 60 * SECOND,

  /** Transaction history — rarely changes except on user action */
  TRANSACTIONS: 5 * MINUTE,

  /** NAV values — updated once per day */
  NAV: 24 * HOUR,

  /** Fundamental reports */
  FUNDAMENTALS: 24 * HOUR,

  /** Company master list — changes quarterly */
  COMPANIES: 7 * 24 * HOUR,

  /** Dividend records */
  DIVIDENDS: 7 * 24 * HOUR,

  /** Historical OHLCV — append-only, never stale */
  HISTORICAL: Infinity,
};

/**
 * Recommended refetchInterval for live data.
 * Returns undefined (no polling) when outside market hours.
 */
export const REFETCH_INTERVALS = {
  LIVE_PRICES: isMarketOpen() ? 30 * SECOND : undefined,
  NEPSE_INDEX: isMarketOpen() ? 60 * SECOND : undefined,
};
