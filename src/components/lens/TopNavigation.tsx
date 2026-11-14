import Link from "next/link";
import { Brand } from "@/components/ui/Brand";
import { ThemeSelect } from "@/components/ui/ThemeSelect";
import { LocationSearch, type MapDestination } from "./LocationSearch";

export function TopNavigation({
  onNavigate,
}: {
  onNavigate: (place: MapDestination) => void;
}) {
  return (
    <header className="workspace-header">
      <Brand />
      <LocationSearch onNavigate={onNavigate} />
      <nav aria-label="Main" className="flex items-center gap-4 text-sm">
        <Link href="/about">About</Link>
        <Link href="/method">Method</Link>
        <ThemeSelect />
      </nav>
    </header>
  );
}
