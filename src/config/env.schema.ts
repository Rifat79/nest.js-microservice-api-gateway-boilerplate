import { z } from 'zod';

export const envSchema = z.object({
  // app
  NODE_ENV: z.enum(['development', 'production', 'test', 'staging']),
  PORT: z.coerce.number().int().positive(),
  REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(30000),
  CORS_ORIGIN: z.string().optional().default('*'),

  // redis
  REDIS_HOST: z.string().min(1, 'REDIS_HOST cannot be empty'),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().optional(),
  REDIS_KEY_PREFIX: z.string().optional().default('cache:'),
  CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(300000), // 5 minutes

  // microservices - selfhost
  SELFHOST_SERVICE_HOST: z
    .string()
    .min(1, 'SELFHOST_SERVICE_HOST cannot be empty'),
  SELFHOST_SERVICE_PORT: z.coerce.number().int().positive(),
  SELFHOST_SERVICE_TIMEOUT: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(30000),

  // microservices - billing
  BILLING_SERVICE_HOST: z
    .string()
    .min(1, 'BILLING_SERVICE_HOST cannot be empty'),
  BILLING_SERVICE_PORT: z.coerce.number().int().positive(),
  BILLING_SERVICE_TIMEOUT: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(20000),

  // circuit breaker
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  CIRCUIT_BREAKER_MONITORING_PERIOD_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120000),

  // log
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional()
    .default('info'),
});

export type EnvVars = z.infer<typeof envSchema>;
