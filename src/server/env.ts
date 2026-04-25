import { z } from "zod";

// Validated at first access (lazy + memoized). Throws on missing/invalid env
// so we never silently 500 at request time, but does NOT throw during the
// Next.js build's "collect page data" pass — the build server doesn't have
// runtime secrets, and we don't want a missing R2 key to block deploys of
// e.g. the docs page or unrelated routes.
//
// PRD §9.4: "fail fast" still holds — the first /api request that touches
// env will throw, surfaced as a generic 500 to the client and the full
// validation message to the server log.
const EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),
  APP_BASE_URL: z.string().url(),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}
