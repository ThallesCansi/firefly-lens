import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { InteractionPreview } from "@/components/interactions/InteractionPreview";

export const metadata: Metadata = {
  title: "Interaction integration preview",
  robots: { index: false, follow: false },
};
export default function InteractionPreviewPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="wrap py-5">
        <h1 className="text-2xl">Map interaction preview</h1>
        <p className="text-sm text-dim mb-4">
          Development surface for independent controls. No satellite analysis or
          map camera is connected here.
        </p>
        <InteractionPreview />
      </main>
    </>
  );
}
