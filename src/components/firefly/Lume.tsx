/**
 * Lume, the firefly. Drawn in the page's own colours; the abdomen is the only
 * part that glows, and it warms to ember when Lume is pointing at a problem.
 */
export function Lume({
  size = 48,
  mood = "idle",
  className = "",
  title,
}: {
  size?: number;
  mood?: "idle" | "alert";
  className?: string;
  /** Leave empty when Lume is decoration next to a text label. */
  title?: string;
}) {
  const light = mood === "alert" ? "var(--color-ember-4)" : "var(--color-lume)";
  return (
    <svg
      className={`lume ${className}`}
      data-mood={mood}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className="lume-body">
        <circle className="lume-glow" cx="22" cy="42" r="19" fill={light} fillOpacity="0.16" />
        <circle className="lume-glow" cx="22" cy="42" r="13" fill={light} fillOpacity="0.22" />
        {/* wings */}
        <g className="lume-wing">
          <ellipse cx="27" cy="20" rx="6.5" ry="15" transform="rotate(-38 27 20)" fill="var(--color-ink)" fillOpacity="0.2" stroke="var(--color-ink)" strokeOpacity="0.55" />
        </g>
        <ellipse cx="34" cy="17" rx="5.5" ry="13" transform="rotate(-14 34 17)" fill="var(--color-ink)" fillOpacity="0.12" stroke="var(--color-ink)" strokeOpacity="0.4" />
        {/* legs */}
        <path d="M35 40l-2 7M40 39l1 7M44 35l4 6" stroke="var(--color-faint)" strokeWidth="1.5" strokeLinecap="round" />
        {/* abdomen: the lantern */}
        <ellipse cx="22" cy="42" rx="11" ry="8.5" transform="rotate(-24 22 42)" fill={light} />
        <path d="M17.5 36.5l6 12M23 34.5l5.5 11" stroke="var(--color-lume-ink)" strokeOpacity="0.28" strokeWidth="1.5" strokeLinecap="round" />
        {/* thorax */}
        <ellipse cx="37" cy="33" rx="8.5" ry="7.5" transform="rotate(-24 37 33)" fill="#39432f" />
        {/* head */}
        <circle cx="47" cy="26" r="7.5" fill="#252c22" />
        <circle cx="49.5" cy="25" r="3" fill="var(--color-ink)" />
        <circle cx="50.3" cy="25.2" r="1.4" fill="var(--color-night)" />
        {/* antennae */}
        <path d="M49 19c1-5 4-8 8-9M52 21c3-3 6-4 9-3" stroke="var(--color-dim)" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
