import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  db: {
    url: process.env.DATABASE_URL ?? 'postgresql://agenthub:agenthub@localhost:5432/agenthub',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS ?? '10', 10),
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  llm: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  },

  deploy: {
    vercelToken: process.env.VERCEL_TOKEN ?? '',
  },
} as const;
