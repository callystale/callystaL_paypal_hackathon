/**
 * Helpers for the user-configurable budget period.
 *
 * The period normally starts on the 1st, but users can set it to any day of the
 * month (e.g. the 25th, to follow a payday). All functions work in local time so
 * the calendar lines up with the browser's dates.
 */

/** Number of days in the given month (month is 0-based). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Clamp a user-provided start day into the valid 1-31 range. */
export function clampStartDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(Math.max(Math.round(day), 1), 31);
}

/** Offsets used by the month filter. Relative to the period containing today. */
export const PERIOD_CURRENT = 0;
export const PERIOD_PREVIOUS = -1;

export type PeriodOffset = typeof PERIOD_CURRENT | typeof PERIOD_PREVIOUS;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

/** The `startDay` of a month, clamped to that month's length (e.g. 31 -> 30). */
function startDayOfMonth(year: number, month: number, startDay: number): Date {
  const day = Math.min(clampStartDay(startDay), daysInMonth(year, month));
  return new Date(year, month, day);
}

/** Start of the budget period that contains `ref`, given a month-start day. */
export function periodStart(ref: Date, startDay: number): Date {
  const candidate = startDayOfMonth(ref.getFullYear(), ref.getMonth(), startDay);
  if (ref.getTime() >= candidate.getTime()) return candidate;
  const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return startDayOfMonth(prev.getFullYear(), prev.getMonth(), startDay);
}

/** Shift a period start by a whole number of months (keeping the same start day). */
export function addMonths(date: Date, delta: number, startDay: number): Date {
  const base = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  return startDayOfMonth(base.getFullYear(), base.getMonth(), startDay);
}

/**
 * Start (inclusive) and end (exclusive) of the budget period `offset` months
 * away from the one containing `ref`. `offset` is 0 for the current period and
 * -1 for the previous one.
 */
export function periodBounds(
  ref: Date,
  startDay: number,
  offset = PERIOD_CURRENT,
): { start: Date; end: Date } {
  const start = addMonths(periodStart(ref, startDay), offset, startDay);
  return { start, end: addMonths(start, 1, startDay) };
}

/** Human label for the period, e.g. "September 2026". */
export function periodName(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Label for a period, which may not line up with a calendar month. Periods
 * starting on the 1st use the month name; custom start days use the date range.
 */
export function periodLabel(start: Date, end: Date): string {
  if (start.getDate() === 1) return periodName(start);
  const last = addDays(end, -1);
  const sameYear = start.getFullYear() === last.getFullYear();
  const startText = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endText = last.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startText} – ${endText}`;
}

/**
 * Friendly heading for a period viewed in the calendar, relative to the
 * current period: "This month", "Last month", "Next month", or a short month
 * label (e.g. "Aug 2026") when viewing further away.
 */
export function periodHeading(
  start: Date,
  currentStart: Date,
  startDay: number,
): string {
  const previous = addMonths(currentStart, -1, startDay);
  const next = addMonths(currentStart, 1, startDay);
  if (start.getTime() === currentStart.getTime()) return "This month";
  if (start.getTime() === previous.getTime()) return "Last month";
  if (start.getTime() === next.getTime()) return "Next month";
  const sameYear = start.getFullYear() === currentStart.getFullYear();
  return start.toLocaleDateString(undefined, {
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Stable local `YYYY-MM-DD` key for grouping purchases by day. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Ordinal label for a day of the month: 1 -> "1st", 22 -> "22nd". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
