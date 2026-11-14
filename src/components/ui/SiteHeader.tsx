import Link from "next/link";
import { Brand } from "./Brand";
import { ThemeSelect } from "./ThemeSelect";

const LINKS = [
  { href: "/lens", label: "Lens" },
  { href: "/method", label: "Method" },
];

export function SiteHeader({
  current,
  overlay = false,
}: {
  current?: string;
  overlay?: boolean;
}) {
  return (
    <header
      className={`site-header ${overlay ? "absolute inset-x-0 top-0 z-30" : "border-b border-line bg-night"}`}
    >
      <div className="wrap flex h-16 items-center justify-between gap-4">
        <Brand />
        <nav aria-label="Main" className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className="rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium text-dim no-underline transition-colors hover:text-ink aria-[current=page]:text-lume"
            >
              {l.label}
            </Link>
          ))}
          <ThemeSelect />
        </nav>
      </div>
    </header>
  );
}
