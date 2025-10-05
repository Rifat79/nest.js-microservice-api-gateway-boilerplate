import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<
      Request & { requestId?: string; user?: { id?: string } }
    >();
    const response = ctx.getResponse<Response>();
    const startTime = Date.now();

    const { method, url, headers } = request;
    const requestId = request.requestId;
    const userId = request.user?.id;

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const { statusCode } = response;

          this.logger.info(
            {
              requestId,
              userId,
              method,
              url,
              statusCode,
              duration,
              userAgent: headers['user-agent'],
              responseSize: JSON.stringify(data).length,
            },
            `${method} ${url} - ${statusCode} - ${duration}ms`,
          );
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;

          this.logger.error(
            {
              requestId,
              userId,
              method,
              url,
              duration,
              error: error.message,
              stack: error.stack,
            },
            `${method} ${url} - ERROR - ${duration}ms`,
          );
        },
      }),
    );
  }
}
