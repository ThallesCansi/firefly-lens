import type { Metadata } from "next";
import { fireData } from "@/lib/data/source";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { PageTour } from "@/components/onboarding/PageTour";
import { MethodTabs } from "@/components/method/MethodTabs";
import { HarmonizationGuide } from "@/components/method/HarmonizationGuide";
import { AnomaliesGuide } from "@/components/method/AnomaliesGuide";
import { DataGuide } from "@/components/method/DataGuide";
import { FireDangerGuide } from "@/components/method/FireDangerGuide";
import "./method.css";

export const metadata: Metadata = {
  title: "The Science Behind the Lens",
  description:
    "The implemented FireFly Lens harmonization, historical comparisons, data provenance and scientific limitations. Clearly distinguished from planned methods.",
};

export default function MethodPage() {
  return (
    <>
      <SiteHeader current="/method" />
      <main id="main" className="wrap method-page">
        <div className="method-intro">
          <p className="eyebrow">FIREFLY LENS / SCIENCE NOTES</p>
          <h1>The Science Behind the Lens</h1>
          <p>
            Understand how satellite observations become comparable fire
            activity insights.
          </p>
          <div className="method-notice">
            <span className="status-dot" />
            <span>
              Current build: real NASA FIRMS data for Brazil,{" "}
              {fireData.firstDay} to {fireData.lastDay}. Observed MODIS Aqua and
              modeled VIIRS continuation; validation and limitations documented.
              Additional South American reports use separate country-wide calibration for 2018–2025.
            </span>
          </div>
        </div>
        <MethodTabs
          panels={{
            harmonization: <HarmonizationGuide />,
            "historical-anomalies": <AnomaliesGuide />,
            "data-limitations": <DataGuide />,
            "fire-danger": <FireDangerGuide />,
          }}
        />
      </main>
      <SiteFooter />
      <PageTour page="method" />
    </>
  );
}
