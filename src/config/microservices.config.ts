import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('services', () => {
  return {
    selfhost: {
      host: validatedEnv.SELFHOST_SERVICE_HOST,
      port: validatedEnv.SELFHOST_SERVICE_PORT,
      timeout: validatedEnv.SELFHOST_SERVICE_TIMEOUT,
    },
    billing: {
      host: validatedEnv.BILLING_SERVICE_HOST,
      port: validatedEnv.BILLING_SERVICE_PORT,
      timeout: validatedEnv.BILLING_SERVICE_TIMEOUT,
    },
  };
});
