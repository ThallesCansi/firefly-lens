import type { Metadata } from "next";
import { LensApp } from "@/components/lens/LensApp";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "Lens",
  description: "A year of fire activity by day, from MODIS and VIIRS on one shared grid.",
};

export default function LensPage() {
  return (
    <>
      <SiteHeader current="/lens" />
      <p className="border-b border-line bg-canopy py-2 text-center text-[0.8125rem] text-dim">
        Simulated detections, shaped like NASA FIRMS records. Live data arrives in the next stage.
      </p>
      <LensApp />
      <SiteFooter />
    </>
  );
}
