#!/usr/bin/env node
/**
 * Trims node_modules of files we don't need on Vercel so the deployed
 * serverless function fits under Vercel's 250 MB unzipped limit.
 *
 * 1. **Imgly model weights (~127 MB)** — `@imgly/background-removal-node`
 *    bundles 33 hash-named, extension-less weight files in `dist/`. The
 *    library happily downloads these from imgly's CDN on first call when
 *    they're not present locally (cached to /tmp). We point it at the CDN
 *    in `BackgroundRemover` via `publicPath`.
 *
 * 2. **Unused onnxruntime-node native binaries (~115 MB)** — the package
 *    ships native binaries for darwin (x64+arm64), linux (x64+arm64), and
 *    win32 (x64+arm64). Vercel's iad1 region is linux/x64 only. Marking
 *    the package as `serverExternalPackages` causes Next to copy the
 *    *entire* package directory into the function bundle as-is (NFT trace
 *    excludes don't apply here), so we have to delete the unused platform
 *    folders ourselves.
 *
 * Runs only on Vercel (or when FORCE_PRUNE_IMGLY=1) so local dev still
 * benefits from the bundled weights and full platform support.
 */
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.VERCEL && !process.env.FORCE_PRUNE_IMGLY) {
  process.exit(0);
}

let removed = 0;
let removedBytes = 0;

/** Recursively delete a path, accumulating size. */
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

/** Find every concrete install path of a pnpm-hoisted package. */
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

// --- 1. Strip imgly model weights (extension-less files in dist/) -----------
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
    if (path.extname(file) !== "") continue; // keep .cjs/.mjs/.json/.ts/.map
    rmrf(path.join(dir, file));
  }
}

// --- 2. Strip onnxruntime-node binaries we don't run on Vercel --------------
// Vercel's iad1 region runs linux/x64. Drop everything else.
const KEEP_PLATFORM = "linux";
const KEEP_ARCH = "x64";
const ortInstalls = findPnpmInstalls(
  "onnxruntime-node@",
  "onnxruntime-node",
);
for (const ortRoot of ortInstalls) {
  const napiDir = path.join(ortRoot, "bin/napi-v3");
  if (!fs.existsSync(napiDir)) continue;
  for (const platform of fs.readdirSync(napiDir)) {
    const platformDir = path.join(napiDir, platform);
    if (platform !== KEEP_PLATFORM) {
      rmrf(platformDir);
      continue;
    }
    for (const arch of fs.readdirSync(platformDir)) {
      if (arch !== KEEP_ARCH) {
        rmrf(path.join(platformDir, arch));
      }
    }
  }
}

console.log(
  `[prune-vercel] removed ${removed} files (${(removedBytes / 1024 / 1024).toFixed(1)} MB)`,
);
