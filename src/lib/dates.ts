/** Calendar helpers. Every date in FireFly Lens is UTC, written YYYY-MM-DD. */

const pad = (n: number) => String(n).padStart(2, "0");

export function dateOfDay(year: number, dayOfYear: number): string {
  const d = new Date(Date.UTC(year, 0, dayOfYear));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** Whole days from `epoch` to `date`, both YYYY-MM-DD. */
export function daysBetween(epoch: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${epoch}T00:00:00Z`)) / 86_400_000);
}

/** The date `days` after `epoch`. */
export function addDays(epoch: string, days: number): string {
  const d = new Date(Date.parse(`${epoch}T00:00:00Z`) + days * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Months since January of `epochYear`; month is 1 to 12. */
export const monthIndex = (epochYear: number, year: number, month: number) => (year - epochYear) * 12 + month - 1;

export const monthStamp = (year: number, month0: number) => `${year}-${pad(month0 + 1)}`;
