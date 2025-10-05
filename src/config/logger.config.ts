import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('logger', () => {
  return {
    logLevel: validatedEnv.LOG_LEVEL,
  };
});
