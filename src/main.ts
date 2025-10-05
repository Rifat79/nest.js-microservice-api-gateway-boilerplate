import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger, PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging-interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use pino logger
  const pinoLogger = app.get(Logger);
  const pLogger = await app.resolve(PinoLogger);
  app.useLogger(pinoLogger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port');

  // Global prefix
  app.setGlobalPrefix('api');
  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // Global filters and interceptors
  app.useGlobalFilters(new AllExceptionsFilter(pLogger));
  app.useGlobalInterceptors(new LoggingInterceptor(pLogger));
  app.useGlobalInterceptors(
    new TimeoutInterceptor(
      configService.get<number>('app.requestTimeoutMs', 30000),
    ),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  // Handle process signals
  const gracefulShutdown = () => {
    void (async () => {
      pinoLogger.log('Shutdown signal received, shutting down gracefully');
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        pinoLogger.error('Error during shutdown', err);
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  await app.listen(port ?? 3080);

  pinoLogger.log(`🚀 Application is running on: http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start API Gateway:', error);
  process.exit(1);
});
