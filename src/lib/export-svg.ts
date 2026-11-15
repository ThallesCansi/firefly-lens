import { MONTHS } from "./format";
import type { MonthCell } from "./harmonize";

export type SvgProvenance = {
  source: string;
  period: string;
  processing: string;
  exportedAt: string;
  from: string;
  to: string;
};
const EMBER = [
  "#2e2723",
  "#6a2f1d",
  "#a63f1c",
  "#dc5f1f",
  "#f59a35",
  "#ffdc78",
];
const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

/** Standalone presentation only: does not recalculate or mutate any scientific values. */
export function renderHistorySvg(
  months: MonthCell[],
  years: number[],
  area: string,
  provenance?: SvgProvenance,
): string {
  const cell = 26,
    left = 56,
    top = 128,
    width = 740;
  const chartEnd = top + years.length * cell;
  const height = Math.max(chartEnd + 154, 390);
  const byKey = new Map(months.map((m) => [`${m.year}:${m.month}`, m]));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif" font-size="11" role="img" aria-labelledby="title description">`,
    `<title id="title">FireFly Lens — ${xml(area)}</title>`,
    `<desc id="description">Monthly harmonized activity. ${xml(provenance?.source ?? "Source not specified")}. Rings indicate at least twice the same-month historical median, not a forecast.</desc>`,
    `<rect width="100%" height="100%" fill="#0e0c0b"/>`,
    `<text x="${left}" y="32" fill="#ff6b1a" font-size="12" letter-spacing="2">FIREFLY LENS</text>`,
    `<text x="${left}" y="58" fill="#f3eee9" font-size="18">${xml(area.slice(0, 72))}</text>`,
    `<text x="${left}" y="80" fill="#b5aaa1">${xml(provenance?.period ?? "Selected years")} · Harmonized monthly activity</text>`,
    `<text x="${left}" y="99" fill="#b5aaa1">MODIS-Aqua-equivalent hot spots · common colour scale across months</text>`,
  ];
  MONTHS.forEach((name, m) =>
    parts.push(
      `<text x="${left + m * cell + cell / 2}" y="${top - 8}" fill="#b5aaa1" text-anchor="middle">${name[0]}</text>`,
    ),
  );
  years.forEach((year, row) => {
    const y = top + row * cell;
    parts.push(
      `<text x="${left - 8}" y="${y + 17}" fill="#b5aaa1" text-anchor="end">${year}</text>`,
    );
    for (let m = 0; m < 12; m++) {
      const c = byKey.get(`${year}:${m}`);
      if (!c) continue;
      const x = left + m * cell;
      const stamp = `${year}-${String(m + 1).padStart(2, "0")}`;
      const inRange =
        !provenance || (stamp >= provenance.from && stamp <= provenance.to);
      parts.push(
        `<g opacity="${inRange ? 1 : 0.25}"><title>${MONTHS[m]} ${year}: ${c.value} Aqua-equivalent hot spots (${c.source}${c.partial ? ", partial" : ""}); median ${c.median}; rank ${c.rank}${inRange ? "" : "; outside selected range"}</title><rect x="${x + 1}" y="${y + 1}" width="24" height="24" rx="3" fill="${EMBER[c.level]}"/>`,
      );
      if (c.ratio !== null && c.ratio >= 2)
        parts.push(
          `<rect x="${x + 2.5}" y="${y + 2.5}" width="21" height="21" rx="2" fill="none" stroke="#f3eee9" stroke-width="1.5"/>`,
        );
      parts.push(`</g>`);
    }
  });
  const legendX = 408;
  parts.push(
    `<text x="${legendX}" y="145" fill="#f3eee9">Relative monthly activity</text>`,
  );
  EMBER.forEach((color, i) =>
    parts.push(
      `<rect x="${legendX + i * 22}" y="158" width="18" height="18" rx="3" fill="${color}"/>`,
    ),
  );
  parts.push(
    `<text x="${legendX}" y="194" fill="#b5aaa1">Less</text><text x="${legendX + 132}" y="194" fill="#b5aaa1" text-anchor="end">More</text>`,
    `<rect x="${legendX}" y="218" width="16" height="16" rx="2" fill="none" stroke="#f3eee9" stroke-width="1.5"/>`,
    `<text x="${legendX + 24}" y="231" fill="#b5aaa1">At least 2× same-month median</text>`,
    `<text x="${legendX}" y="260" fill="#b5aaa1">Dimmed cells: outside selected range</text>`,
    `<text x="${legendX}" y="284" fill="#b5aaa1">Hot spots are not independent fires.</text>`,
    `<path d="M${left} ${height - 124}H${width - 32}" stroke="#362e29"/>`,
    `<text x="${left}" y="${height - 101}" fill="#f3eee9">${xml(provenance?.source ?? "Source not specified — consult the generating application")}</text>`,
    `<text x="${left}" y="${height - 80}" fill="#b5aaa1">${xml(provenance?.processing ?? "FireFly Lens offline NB2 harmonization")}</text>`,
    `<text x="${left}" y="${height - 59}" fill="#b5aaa1">${xml(provenance ? `Exported ${provenance.exportedAt}` : "No export timestamp supplied")}</text>`,
    `<text x="${left}" y="${height - 38}" fill="#b5aaa1">Observed / modeled series - see Method for validation scope and limitations</text>`,
    `<text x="${left}" y="${height - 17}" fill="#b5aaa1">Method: /method · NASA Space Apps Challenge 2026 · not endorsed by NASA</text>`,
    `</svg>`,
  );
  return parts.join("\n");
}
