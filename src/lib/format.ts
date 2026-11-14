const utc = (date: string) => new Date(`${date}T00:00:00Z`);

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const NUMBER = new Intl.NumberFormat("en-GB");

export const longDate = (date: string) => LONG.format(utc(date));
export const shortDate = (date: string) => SHORT.format(utc(date));
export const weekdayDate = (date: string) => WEEKDAY.format(utc(date));
export const count = (n: number) => NUMBER.format(Math.round(n));
/** The 0-1 index shown as 0-100. */
export const indexScore = (index: number) => String(Math.round(index * 100));

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
