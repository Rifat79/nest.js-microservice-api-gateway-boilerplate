import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { Logger, PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use pino logger
  const pinoLogger = app.get(Logger);
  const pLogger = await app.resolve(PinoLogger);
  app.useLogger(pinoLogger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port');

  // Security
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  // Compression middleware
  app.use(compression());

  // CORS configuration
  app.enableCors({
    origin: configService.get<string>('app.corsOrigin') ?? '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global prefix
  app.setGlobalPrefix('api');
  // Versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // Global filters and interceptors
  app.useGlobalFilters(new AllExceptionsFilter(pLogger));
  // app.useGlobalInterceptors(new LoggingInterceptor(pLogger));
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
