import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";

// Manrope — body + headlines.
// Inter (weight 500) — used for tabular numerals (timer / metadata)
// per Stitch design system §Typography. Inter is *not* a monospaced
// typeface; we lean on `font-variant-numeric: tabular-nums` (applied
// to the `font-mono` utility in globals.css) to keep digits aligned.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const interNumeric = Inter({
  variable: "--font-inter-numeric",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MirrorMe — Say hi to yourself.",
  description:
    "Drop in a photo. We remove the background and flip it horizontally. That's it. Shareable link, 24-hour TTL.",
};

// Mobile rendering + browser-chrome theming. Without `width=device-width`
// mobile Safari renders at desktop width; `themeColor` picks up our brand
// primary in Android Chrome's URL bar and the iOS PWA status bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4648d4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${interNumeric.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
