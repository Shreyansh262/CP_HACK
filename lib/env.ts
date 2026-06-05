// Fail fast with a clear message instead of a cryptic crash mid-request (#15).

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function redisEnv(): { url: string; token: string } {
  return {
    url: requireEnv('UPSTASH_REDIS_REST_URL'),
    token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
  };
}

export function geminiApiKey(): string {
  return requireEnv('GEMINI_API_KEY');
}
