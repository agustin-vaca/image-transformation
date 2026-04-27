#!/usr/bin/env node
/**
 * Trims node_modules of files we don't need on Vercel so the deployed
 * serverless function fits under Vercel's 250 MB unzipped limit.
 *
 * On linux, onnxruntime-node's postinstall downloads the *GPU* variant of
 * the runtime, which ships ~460 MB of CUDA + TensorRT provider .so files
 * (`libonnxruntime_providers_cuda.so`, `libonnxruntime_providers_tensorrt.so`).
 * We always run on CPU, so those are pure dead weight. We also drop the
 * darwin/win32/linux-arm64 binaries since iad1 is linux/x64.
 *
 * We ALSO drop the @imgly/background-removal-node model weights (~127 MB
 * of extension-less hash-named files in dist/). They're fetched from
 * IMG.LY's CDN at runtime via `publicPath` instead. We attempted bundling
 * them via `outputFileTracingIncludes`, but Turbopack rewrites
 * `import.meta.url` in server bundles, so `createRequire().resolve()`
 * throws at runtime no matter what's traced — leaving the weights as dead
 * weight in the deployed lambda.
 *
 * Runs only on Vercel (or when FORCE_PRUNE_IMGLY=1) so local dev is
 * unaffected.
 */
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.VERCEL && !process.env.FORCE_PRUNE_IMGLY) {
  process.exit(0);
}

let removed = 0;
let removedBytes = 0;

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(target)) {
      rmrf(path.join(target, child));
    }
    fs.rmdirSync(target);
  } else {
    removedBytes += stat.size;
    fs.unlinkSync(target);
    removed += 1;
  }
}

function findPnpmInstalls(packagePrefix, packageName) {
  const out = [];
  const pnpmRoot = path.join(process.cwd(), "node_modules/.pnpm");
  if (!fs.existsSync(pnpmRoot)) return out;
  for (const entry of fs.readdirSync(pnpmRoot)) {
    if (!entry.startsWith(packagePrefix)) continue;
    out.push(
      path.join(pnpmRoot, entry, "node_modules", packageName),
    );
  }
  return out;
}

// --- Strip imgly model weights (extension-less hash files in dist/) ---------
const imglyDistDirs = [
  ...findPnpmInstalls(
    "@imgly+background-removal-node@",
    "@imgly/background-removal-node",
  ).map((p) => path.join(p, "dist")),
  path.join(process.cwd(), "node_modules/@imgly/background-removal-node/dist"),
];
for (const dir of imglyDistDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    // Keep .cjs/.mjs/.json/.ts/.map; drop hash-named binary chunks.
    if (path.extname(file) !== "") continue;
    rmrf(path.join(dir, file));
  }
}

// --- Strip onnxruntime-node binaries we don't run on Vercel -----------------
const KEEP_PLATFORM = "linux";
const KEEP_ARCH = "x64";
const ORT_DROP_LIBS = new Set([
  "libonnxruntime_providers_cuda.so",
  "libonnxruntime_providers_tensorrt.so",
]);
for (const ortRoot of findPnpmInstalls("onnxruntime-node@", "onnxruntime-node")) {
  const napiDir = path.join(ortRoot, "bin/napi-v3");
  if (!fs.existsSync(napiDir)) continue;
  for (const platform of fs.readdirSync(napiDir)) {
    const platformDir = path.join(napiDir, platform);
    if (platform !== KEEP_PLATFORM) {
      rmrf(platformDir);
      continue;
    }
    for (const arch of fs.readdirSync(platformDir)) {
      const archDir = path.join(platformDir, arch);
      if (arch !== KEEP_ARCH) {
        rmrf(archDir);
        continue;
      }
      for (const lib of fs.readdirSync(archDir)) {
        if (ORT_DROP_LIBS.has(lib)) {
          rmrf(path.join(archDir, lib));
        }
      }
    }
  }
}

console.log(
  `[prune-vercel] removed ${removed} files (${(removedBytes / 1024 / 1024).toFixed(1)} MB)`,
);
