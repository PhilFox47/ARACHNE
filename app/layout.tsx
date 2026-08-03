import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";
import { WebLattice } from "@/components/WebLattice";
import { ServiceWorker } from "@/components/ServiceWorker";

/**
 * Barlow Condensed carries display and numbers: condensed is what lets a weight
 * readout be genuinely enormous on a 390px screen without wrapping. Inter is the
 * body face. Both self-hosted by next/font — no CDN request, so the installed
 * PWA renders correctly offline.
 */
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARACHNE",
  description: "Field console.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ARACHNE",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0D16",
  width: "device-width",
  initialScale: 1,
  // No pinch-zoom bounce when the app is installed to the home screen.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${inter.variable}`}>
      <body>
        <WebLattice />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
