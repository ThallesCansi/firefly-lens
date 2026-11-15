import type { Metadata, Viewport } from "next";
import { DM_Mono, Funnel_Display, Funnel_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { themeInit } from "@/lib/theme-init";

const display = Funnel_Display({
  variable: "--font-funnel-display",
  subsets: ["latin"],
});
const sans = Funnel_Sans({
  variable: "--font-funnel-sans",
  subsets: ["latin"],
});
const mono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const shareDescription =
  "MODIS and VIIRS hot spots harmonized into one fire record for South America, 2002 to 2026, read as a calendar of fire activity.";

export const metadata: Metadata = {
  // Link previews (WhatsApp, Slack, social) need absolute image URLs.
  metadataBase: new URL("https://firefly-lens.vercel.app"),
  title: {
    default: "FireFly Lens: one fire calendar from MODIS and VIIRS",
    template: "%s · FireFly Lens",
  },
  description:
    "FireFly Lens harmonizes real MODIS and VIIRS hot spots for Brazil into one series and shows 24 years of fire activity as a calendar, with unusual days and the fire season marked.",
  // The image itself comes from app/opengraph-image.jpg.
  openGraph: {
    type: "website",
    siteName: "FireFly Lens",
    title: "FireFly Lens: one fire calendar from two satellite sensors",
    description: shareDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "FireFly Lens: one fire calendar from two satellite sensors",
    description: shareDescription,
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0c0b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex min-h-svh flex-col">
        <a
          href="#main"
          className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
