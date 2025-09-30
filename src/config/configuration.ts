import { registerAs } from '@nestjs/config';

export default registerAs('services', () => {
  return {
    selfhost: { timeout: 30000 },
    billing: { timeout: 20000 },
    notification: { timeout: 15000 },
    webhook: { timeout: 10000 },
  };
});
