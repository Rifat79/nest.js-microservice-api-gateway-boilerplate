import KeyvRedis, { Keyv } from '@keyv/redis';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

@Module({
  imports: [
    ConfigModule,
    NestCacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD', '');
        const db = configService.get<number>('REDIS_DB', 0);
        const prefix = configService.get<string>('REDIS_KEY_PREFIX', 'cache:');
        const ttl = configService.get<number>('CACHE_TTL_MS', 300_000); // 5 minutes

        const redisUrl = new URL(`redis://${host}:${port}`);
        if (password) redisUrl.password = password;
        if (db !== undefined) redisUrl.pathname = `/${db}`;

        const redisStore = new KeyvRedis(redisUrl.toString());

        const keyv = new Keyv({
          store: redisStore,
          namespace: prefix,
        });

        keyv.on('error', (err) => {
          console.error('❌ Redis cache error:', err);
        });

        return {
          store: keyv,
          ttl,
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
