import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";
import { BRAND } from "@/modules/config/brand";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
});

export const metadata: Metadata = {
  title: `${BRAND.name} — clinical notes that keep pace with the visit`,
  description: BRAND.tagline,
  applicationName: BRAND.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: BRAND.shortName,
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/treow-192.png",
    apple: "/icons/treow-192.png",
  },
  openGraph: {
    title: BRAND.name,
    description: BRAND.tagline,
    images: [{ url: "/brand/landing-hero.jpg" }],
  },
};

export const viewport: Viewport = {
  themeColor: BRAND.colours.forest,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${cormorant.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
