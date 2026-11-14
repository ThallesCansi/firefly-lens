import Link from "next/link";
import { Lume } from "@/components/firefly/Lume";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="wrap flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-3">
          <Lume size={40} className="shrink-0" />
          <p className="max-w-[46ch] text-[0.9375rem] text-dim">
            FireFly Lens is a NASA Space Apps Challenge 2026 project. It is not endorsed by NASA. This build runs on
            simulated detections.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-6 text-[0.9375rem]">
          <Link href="/lens" className="link">
            Open the Lens
          </Link>
          <Link href="/method" className="link">
            Read the method
          </Link>
        </nav>
      </div>
    </footer>
  );
}
