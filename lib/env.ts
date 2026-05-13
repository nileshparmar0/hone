function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required env var: ${name}. Check .env.local locally or your Vercel project settings in production.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  LINQ_API_TOKEN: required('LINQ_API_TOKEN'),
  LINQ_WEBHOOK_SECRET: required('LINQ_WEBHOOK_SECRET'),
  LINQ_FROM_NUMBER: required('LINQ_FROM_NUMBER'),

  GEMINI_API_KEY: required('GEMINI_API_KEY'),

  DATABASE_URL: required('DATABASE_URL'),

  CRON_SECRET: required('CRON_SECRET'),

  NODE_ENV: optional('NODE_ENV', 'development'),
} as const;