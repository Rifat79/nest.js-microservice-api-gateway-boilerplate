import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import appConfig from './config/app.config';
import configuration from './config/microservices.config';
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
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
