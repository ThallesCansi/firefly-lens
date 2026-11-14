import Link from "next/link";
import { Lume } from "@/components/firefly/Lume";

const LINKS = [
  { href: "/lens", label: "Lens" },
  { href: "/method", label: "Method" },
];

export function SiteHeader({ current, overlay = false }: { current?: string; overlay?: boolean }) {
  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-30" : "border-b border-line bg-night"}>
      <div className="wrap flex h-16 items-center justify-between gap-4">
        <Link href="/" className="-ml-1 flex items-center gap-2 text-ink no-underline">
          <Lume size={34} />
          <span className="font-display text-xl tracking-tight">FireFly Lens</span>
        </Link>
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
        </nav>
      </div>
    </header>
  );
}
