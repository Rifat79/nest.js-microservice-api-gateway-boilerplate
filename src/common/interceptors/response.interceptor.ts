import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();

    const start = Date.now();

    return next.handle().pipe(
      map((data) => {
        const duration = Date.now() - start;

        return {
          success: true,
          statusCode: (data?.statusCode as number) ?? 200,
          data,
          timestamp: new Date().toISOString(),
          duration,
          path: request.url,
          method: request.method,
          requestId: (request.headers['x-request-id'] as string) ?? undefined,
        };
      }),
    );
  }
}
