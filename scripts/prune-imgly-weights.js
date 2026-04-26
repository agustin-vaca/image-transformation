#!/usr/bin/env node
/**
 * Strips the ~127 MB of bundled ONNX model weights from the
 * `@imgly/background-removal-node` package so they don't get traced into the
 * Vercel serverless function (which has a 300 MB unzipped size limit).
 *
 * The library happily downloads these weights from imgly's CDN on first
 * call when they're not present locally (cached to /tmp for the lifetime
 * of the warm lambda).
 *
 * The bundled weight files are extension-less, hash-named files inside
 * `dist/` — easy to identify, hard to express as a Turbopack glob, hence
 * this script.
 *
 * Runs only on Vercel (or when FORCE_PRUNE_IMGLY=1) so local dev still
 * benefits from the offline bundled weights.
 */
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.VERCEL && !process.env.FORCE_PRUNE_IMGLY) {
  process.exit(0);
}

const candidates = [
  "node_modules/@imgly/background-removal-node/dist",
];

// pnpm hoists into .pnpm/<pkg>/node_modules/<pkg>/dist — handle that too.
const pnpmRoot = path.join(process.cwd(), "node_modules/.pnpm");
if (fs.existsSync(pnpmRoot)) {
  for (const entry of fs.readdirSync(pnpmRoot)) {
    if (entry.startsWith("@imgly+background-removal-node@")) {
      candidates.push(
        path.join(
          "node_modules/.pnpm",
          entry,
          "node_modules/@imgly/background-removal-node/dist",
        ),
      );
    }
  }
}

let removed = 0;
let removedBytes = 0;

for (const rel of candidates) {
  const dir = path.join(process.cwd(), rel);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    if (path.extname(file) !== "") continue; // keep .cjs, .mjs, .json, .ts, .map
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    removedBytes += stat.size;
    fs.unlinkSync(full);
    removed += 1;
  }
}

console.log(
  `[prune-imgly-weights] removed ${removed} files (${(removedBytes / 1024 / 1024).toFixed(1)} MB)`,
);
