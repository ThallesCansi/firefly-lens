import type { Metadata } from "next";
import { LensApp } from "@/components/lens/LensApp";

export const metadata: Metadata = {
  title: "Lens",
  description: "Two decades of burning activity by month and by day, from MODIS and VIIRS harmonized into one record.",
};

export default function LensPage() {
  return (
    <>
      <LensApp />
    </>
  );
}
