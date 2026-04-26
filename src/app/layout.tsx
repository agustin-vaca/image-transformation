import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import "./globals.css";

// Manrope — body + headlines. Inter at weight 500 — used for monospaced
// numerals (timer / metadata) per Stitch design system §Typography.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const interMono = Inter({
  variable: "--font-inter-mono",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MirrorMe — Say hi to yourself.",
  description:
    "Drop in a photo. We remove the background and flip it horizontally. That's it. Shareable link, 24-hour TTL.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${interMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
