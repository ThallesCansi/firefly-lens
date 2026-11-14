import Link from "next/link";
import { Lume } from "@/components/firefly/Lume";

/** Only the wordmark composition changes; the original mascot stays untouched. */
export function Brand() {
  return (
    <Link href="/" className="brand-signature" aria-label="FireFly Lens home">
      <Lume size={34} />
      <span>Lens</span>
    </Link>
  );
}
