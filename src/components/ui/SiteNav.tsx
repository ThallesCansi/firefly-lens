import Link from "next/link";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

const ALL = [
  { href: "/lens", label: "Lens" },
  { href: "/about", label: "About" },
  { href: "/method", label: "Method" },
];

/**
 * The site's navigation as one small floating card: mark, page links and the
 * theme switch. On the map it floats over the top-left corner; on the content
 * pages it floats at the top and stays while scrolling.
 */
export function SiteNav({
  current,
  className = "",
}: {
  /** Path of the page being shown; its link is marked and, on the map, left out. */
  current?: string;
  className?: string;
}) {
  const links = current === "/lens" ? ALL.filter((l) => l.href !== "/lens") : ALL;
  return (
    <header className={`site-card map-surface ${className}`}>
      <Brand />
      <span className="site-card-rule" aria-hidden="true" />
      <nav aria-label="Main" className="site-card-links" data-tour="site-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <ThemeToggle />
    </header>
  );
}
