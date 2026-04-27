import { removeBackground } from "@imgly/background-removal-node";
import { ApiError, ErrorCodes } from "@/server/errors";

// Weights are fetched from IMG.LY's CDN on first call rather than bundled.
// We previously tried bundling them via `outputFileTracingIncludes` so the
// model would be on local disk, but Vercel's Turbopack rewrites
// `import.meta.url` in server bundles, which breaks `createRequire` —
// `require.resolve("@imgly/background-removal-node")` throws at runtime no
// matter what's in the deployment. The CDN fetch costs ~5s on cold starts;
// the small model variant (below) is the bigger speedup anyway.
const IMGLY_CDN_PUBLIC_PATH =
  "https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/";

export class BackgroundRemover {
  async remove(buf: Buffer, mime: string = "image/png"): Promise<Buffer> {
    try {
      const blob = new Blob([new Uint8Array(buf)], { type: mime });
      const out = await removeBackground(blob, {
        publicPath: IMGLY_CDN_PUBLIC_PATH,
        // The "small" variant (~42 MB) is plenty for a flip+share preview and
        // runs noticeably faster than the default ("medium").
        model: "small",
      });
      return Buffer.from(await out.arrayBuffer());
    } catch (err) {
      // Log the underlying cause server-side (visible in Vercel logs) but
      // keep the client-facing message generic — the underlying error can
      // contain filesystem paths or secret names.
      console.error("Background removal failed:", err);
      throw new ApiError(
        ErrorCodes.BG_REMOVAL_FAILED,
        "Failed to remove background.",
      );
    }
  }
}
