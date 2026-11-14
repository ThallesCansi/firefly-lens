import Link from "next/link";
import { Lume } from "@/components/firefly/Lume";
import { LocationSearch, type MapDestination } from "./LocationSearch";

export function TopNavigation({
  onNavigate,
}: {
  onNavigate: (place: MapDestination) => void;
}) {
  return (
    <header className="workspace-header">
      <Link href="/" className="flex items-center gap-2 no-underline">
        <Lume size={32} />
        <span className="font-display text-xl">FireFly Lens</span>
      </Link>
      <LocationSearch onNavigate={onNavigate} />
      <nav aria-label="Main" className="flex items-center gap-4 text-sm">
        <Link href="/about">About</Link>
        <Link href="/method">Method</Link>
      </nav>
    </header>
  );
}
