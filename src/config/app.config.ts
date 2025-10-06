import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('app', () => {
  return {
    nodeEnv: validatedEnv.NODE_ENV,
    port: validatedEnv.PORT,
    requestTimeoutMs: validatedEnv.REQUEST_TIMEOUT_MS,
    corsOrigin: validatedEnv.CORS_ORIGIN,
  };
});
