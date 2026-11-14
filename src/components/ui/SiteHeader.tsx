import { SiteNav } from "./SiteNav";

/**
 * The content pages' header: the same floating site card as on the map, kept
 * in view while scrolling. `overlay` lets it float over a full-bleed hero.
 */
export function SiteHeader({
  current,
  overlay = false,
}: {
  current?: string;
  overlay?: boolean;
}) {
  return (
    <div className={`site-header-float ${overlay ? "is-overlay" : ""}`}>
      <div className="wrap">
        <SiteNav current={current} />
      </div>
    </div>
  );
}
