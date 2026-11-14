import { CalendarPreview } from "@/components/landing/CalendarPreview";
import { DataCredits } from "@/components/landing/DataCredits";
import { Harmonize } from "@/components/landing/Harmonize";
import { LensHero } from "@/components/landing/LensHero";
import { TwoSensors } from "@/components/landing/TwoSensors";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader overlay />
      <main id="main">
        <LensHero />
        <TwoSensors />
        <Harmonize />
        <CalendarPreview />
        <DataCredits />
      </main>
      <SiteFooter />
    </>
  );
}
