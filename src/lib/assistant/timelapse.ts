/**
 * The months a requested time-lapse can play. A year stands for its whole
 * span (January to December); the range is cut to the months the record
 * covers, and the answer says so, so the assistant can tell the person.
 */
export type TimelapseRange =
  | { ok: true; from: string; to: string; trimmed: boolean }
  | { ok: false; reason: string };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function asMonth(value: string, end: boolean): string | null {
  const text = value.trim();
  if (/^\d{4}$/.test(text)) return `${text}-${end ? "12" : "01"}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return MONTH.test(text.slice(0, 7)) ? text.slice(0, 7) : null;
  return MONTH.test(text) ? text : null;
}

export function timelapseRange(fromRaw: string, toRaw: string, first: string, last: string): TimelapseRange {
  let from = asMonth(fromRaw, false);
  let to = asMonth(toRaw, true);
  if (!from || !to) return { ok: false, reason: "Use YYYY or YYYY-MM for the start and the end." };
  if (from > to) [from, to] = [asMonth(toRaw, false)!, asMonth(fromRaw, true)!];
  if (to < first || from > last)
    return { ok: false, reason: `The record covers ${first} to ${last}; nothing of the requested range is in it.` };
  const start = from < first ? first : from;
  const end = to > last ? last : to;
  return { ok: true, from: start, to: end, trimmed: start !== from || end !== to };
}
