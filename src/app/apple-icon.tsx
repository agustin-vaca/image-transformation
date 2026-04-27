import { ImageResponse } from "next/og";

// Next.js App Router convention for the iOS home-screen / PWA icon. Same
// glyph as the favicon, sized for retina home-screen pinning.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4648d4",
          color: "#ffffff",
          fontSize: 130,
          fontWeight: 800,
          letterSpacing: "-0.04em",
        }}
      >
        M
      </div>
    ),
    { ...size },
  );
}
