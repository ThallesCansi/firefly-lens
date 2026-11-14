import type { Metadata } from "next";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { MethodTabs } from "@/components/method/MethodTabs";
import { HarmonizationGuide } from "@/components/method/HarmonizationGuide";
import { AnomaliesGuide } from "@/components/method/AnomaliesGuide";
import { DataGuide } from "@/components/method/DataGuide";
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
              Current build: simulated data, 2001–2025. Provisional method;
              real-data validation pending.
            </span>
          </div>
        </div>
        <MethodTabs
          panels={{
            harmonization: <HarmonizationGuide />,
            "historical-anomalies": <AnomaliesGuide />,
            "data-limitations": <DataGuide />,
          }}
        />
      </main>
      <SiteFooter />
    </>
  );
}
