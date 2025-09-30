import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { CacheModule } from './cache/cache.module';
import appConfig from './config/app.config';
import configuration from './config/configuration';
import { MicroservicesClientsModule } from './microservices/client.module';
import { ProxyModule } from './proxy/proxy.module';

@Module({
  imports: [
    // Configurations
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig, configuration],
    }),

    // Cache
    CacheModule,
    // CacheModule.registerAsync({
    //   isGlobal: true,
    //   imports: [ConfigModule],
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => {
    //     const host = configService.get<string>('REDIS_HOST', 'localhost');
    //     const port = configService.get<number>('REDIS_PORT', 6379);
    //     const password = configService.get<string>('REDIS_PASSWORD', '');
    //     const db = configService.get<number>('REDIS_DB', 0);
    //     const prefix = configService.get<string>('REDIS_KEY_PREFIX', 'cache:');
    //     const ttl = configService.get<number>('CACHE_TTL_MS', 300000); // 5 minutes

    //     const redisUrl = new URL(`redis://${host}:${port}`);
    //     if (password) redisUrl.password = password;
    //     if (db !== undefined) redisUrl.pathname = `/${db}`;

    //     const redisStore = new KeyvRedis(redisUrl.toString());

    //     const keyv = new Keyv({
    //       store: redisStore,
    //       namespace: prefix, // Adds key prefix like "cache:"
    //     });

    //     keyv.on('error', (err) => {
    //       console.error('❌ Redis cache error:', err);
    //     });

    //     return {
    //       store: keyv,
    //       ttl,
    //     };
    //   },
    // }),

    // Logger
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get<string>('LOG_LEVEL', 'info'),
          transport:
            configService.get<string>('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    levelFirst: true,
                    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
                    messageFormat: '{req.method} {req.url} - {msg}',
                    ignore: 'pid,hostname,req,res,responseTime',
                    errorLikeObjectKeys: ['err', 'error'],
                  },
                }
              : undefined,
          serializers: {
            req: (req) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              headers: {
                host: req.headers?.host ?? undefined,
                'user-agent': req.headers?.['user-agent'] ?? undefined,
                'content-type': req.headers?.['content-type'] ?? undefined,
                authorization: req.headers?.authorization
                  ? '[REDACTED]'
                  : undefined,
                'x-api-key': req.headers?.['x-api-key']
                  ? '[REDACTED]'
                  : undefined,
              },
              remoteAddress: req.remoteAddress,
              remotePort: req.remotePort,
            }),
            res: (res) => ({
              statusCode: res.statusCode,
              headers: {
                'content-type': res.headers?.['content-type'] ?? undefined,
                'content-length': res.headers?.['content-length'] ?? undefined,
              },
            }),
            err: (err) => ({
              type: err.type,
              message: err.message,
              stack: err.stack,
            }),
          },

          customProps: (req) => ({
            requestId: req.headers['x-request-id'],
            // userId: req.user?.id,
            // tenantId: req.headers['x-tenant-id'],
          }),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers["x-api-key"]',
              'req.headers.cookie',
              'req.body.password',
              'req.body.token',
            ],
            censor: '[REDACTED]',
          },
          genReqId: (req) => req?.headers['x-request-id'] ?? randomUUID(),
        },
      }),
    }),

    // Microservices
    MicroservicesClientsModule,

    // Proxy
    ProxyModule,
  ],
})
export class AppModule {}
