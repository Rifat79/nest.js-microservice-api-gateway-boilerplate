import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import appConfig from './config/app.config';
import configuration from './config/configuration';
import { LoggerModule } from './logger/logger.module';
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

    // Logger
    LoggerModule,

    // Microservices
    MicroservicesClientsModule,

    // Proxy
    ProxyModule,
  ],
})
export class AppModule {}
