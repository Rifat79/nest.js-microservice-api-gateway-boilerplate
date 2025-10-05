import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('redis', () => {
  return {
    host: validatedEnv.REDIS_HOST,
    port: validatedEnv.REDIS_PORT,
    password: validatedEnv.REDIS_PASSWORD,
    db: validatedEnv.REDIS_DB,
    keyPrefix: validatedEnv.REDIS_KEY_PREFIX,
    cacheTtlMs: validatedEnv.CACHE_TTL_MS,
  };
});
