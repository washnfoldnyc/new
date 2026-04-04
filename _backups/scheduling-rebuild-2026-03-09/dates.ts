/**
 * Parse a YYYY-MM-DD date string as LOCAL time (not UTC).
 * new Date("2026-03-13") parses as UTC midnight = March 12 in US timezones.
 * This function avoids that by using the Date(year, month, day) constructor.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Format a YYYY-MM-DD string for display without UTC shift.
 */
export function formatLocalDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', options || { weekday: 'long', month: 'long', day: 'numeric' })
}
