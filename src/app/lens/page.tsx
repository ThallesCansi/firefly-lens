import type { Metadata } from "next";
import { LensApp } from "@/components/lens/LensApp";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "Lens",
  description: "Two decades of burning activity by month and by day, from MODIS and VIIRS harmonized into one record.",
};

export default function LensPage() {
  return (
    <>
      <SiteHeader current="/lens" />
      <p className="border-b border-line bg-canopy py-2 text-center text-[0.8125rem] text-dim">
        Simulated detections for 2001 to 2025, shaped like NASA FIRMS records.
      </p>
      <LensApp />
      <SiteFooter />
    </>
  );
}
