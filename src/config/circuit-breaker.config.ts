import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('circuitBreaker', () => {
  return {
    failureThreshold: validatedEnv.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    resetTimeout: validatedEnv.CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    monitoringPeriod: validatedEnv.CIRCUIT_BREAKER_MONITORING_PERIOD_MS,
  };
});
