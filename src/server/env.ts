import { z } from "zod";

// Lazy + memoized so missing env doesn't fail Next's build-time page-data
// collection (which has no runtime secrets). The first request that touches
// env throws; the route handler turns it into a 500.
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
