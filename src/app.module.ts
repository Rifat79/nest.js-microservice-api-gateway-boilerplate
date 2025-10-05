import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import appConfig from './config/app.config';
import circuitBreakerConfig from './config/circuit-breaker.config';
import loggerConfig from './config/logger.config';
import configuration from './config/microservices.config';
import redisConfig from './config/redis.config';
import { LoggerModule } from './logger/logger.module';
import { MicroservicesClientsModule } from './microservices/client.module';
import { ProxyModule } from './proxy/proxy.module';

@Module({
  imports: [
    // Configurations
    ConfigModule.forRoot({
      isGlobal: true,
      // envFilePath: ['.env.local', '.env'],
      load: [
        appConfig,
        configuration,
        redisConfig,
        circuitBreakerConfig,
        loggerConfig,
      ],
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
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
