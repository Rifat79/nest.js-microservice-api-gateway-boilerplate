import { registerAs } from '@nestjs/config';

export default registerAs('services', () => {
  return {
    selfhost: {
      host: process.env.SELFHOST_SERVICE_HOST ?? 'localhost',
      port: process.env.SELFHOST_SERVICE_PORT ?? 3081,
      timeout: 30000,
    },
    billing: {
      host: process.env.BILLING_SERVICE_HOST ?? 'localhost',
      port: process.env.BILLING_SERVICE_PORT ?? 3082,
      timeout: 20000,
    },
    notification: {
      host: process.env.NOTIFICATION_SERVICE_HOST ?? 'localhost',
      port: process.env.NOTIFICATION_SERVICE_PORT ?? 3083,
      timeout: 15000,
    },
    webhook: {
      host: process.env.WEBHOOK_SERVICE_HOST ?? 'localhost',
      port: process.env.WEBHOOK_SERVICE_PORT ?? 3084,
      timeout: 10000,
    },
  };
});
