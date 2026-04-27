import { ImageResponse } from "next/og";

// Next.js App Router auto-wires this as the site favicon at every standard
// size. We render an "M" (MirrorMe) — bold, white, on the brand primary —
// instead of the stock Next.js favicon.ico.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          borderRadius: 6,
        }}
      >
        M
      </div>
    ),
    { ...size },
  );
}
