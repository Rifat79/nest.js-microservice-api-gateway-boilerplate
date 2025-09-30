import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
  };
});
