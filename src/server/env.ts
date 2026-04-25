import { z } from "zod";

// Parsed eagerly at module load. Throws on missing/invalid env so we never
// silently 500 at request time. See PRD §9.4.
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

export const env: Env = parseEnv();

// Back-compat accessor; returns the same eagerly-parsed value.
export function getEnv(): Env {
  return env;
}
