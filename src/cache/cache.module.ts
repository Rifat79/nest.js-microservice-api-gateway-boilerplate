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
        const host = configService.get<string>('redis.host');
        const port = configService.get<number>('redis.port');
        const password = configService.get<string>('redis.password');
        const db = configService.get<number>('redis.db');
        const prefix = configService.get<string>('redis.keyPrefix');
        const ttl = configService.get<number>('redis.cacheTtlMs');

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
