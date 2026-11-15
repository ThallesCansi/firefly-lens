import { CalendarPreview } from "@/components/landing/CalendarPreview";
import { DataCredits } from "@/components/landing/DataCredits";
import { Harmonize } from "@/components/landing/Harmonize";
import { LensHero } from "@/components/landing/LensHero";
import { TwoSensors } from "@/components/landing/TwoSensors";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { PageTour } from "@/components/onboarding/PageTour";

export default function Home() {
  return (
    <>
      <SiteHeader current="/about" overlay />
      <main id="main">
        <LensHero />
        <TwoSensors />
        <Harmonize />
        <CalendarPreview />
        <DataCredits />
      </main>
      <SiteFooter />
      <PageTour page="about" />
    </>
  );
}
