/**
 * One-shot: configure CORS on the R2 bucket so the browser can PUT directly
 * to a presigned URL. Idempotent — safe to re-run.
 *
 * Usage:  node scripts/r2-set-cors.mjs
 *
 * Reads R2_* + APP_BASE_URL from .env. Uses the S3-compatible API
 * (`PutBucketCors`), so the existing R2 access key is sufficient — no
 * Cloudflare API token required.
 */
import { readFileSync } from "node:fs";
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

function loadEnv(path = ".env") {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv();
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  APP_BASE_URL,
} = env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error("Missing R2_* env vars in .env");
  process.exit(1);
}

const appOrigin = APP_BASE_URL
  ? new URL(APP_BASE_URL).origin
  : null;

const allowedOrigins = [
  ...(appOrigin ? [appOrigin] : []),
  "https://*.vercel.app", // preview deployments
  "http://localhost:3000",
];

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const cors = {
  Bucket: R2_BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: allowedOrigins,
        AllowedMethods: ["PUT", "GET", "HEAD"],
        AllowedHeaders: ["content-type", "content-length"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
  },
};

console.log("Setting CORS on bucket:", R2_BUCKET);
console.log("AllowedOrigins:", allowedOrigins);

await client.send(new PutBucketCorsCommand(cors));
console.log("✓ CORS applied");

const verify = await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }));
console.log("Current CORS:", JSON.stringify(verify.CORSRules, null, 2));
