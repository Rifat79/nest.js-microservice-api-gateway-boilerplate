import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      requestId: (request as any).requestId,
      error:
        typeof message === 'string'
          ? message
          : (message as any).error || 'Unknown error',
      message:
        typeof message === 'string'
          ? message
          : (message as any).message || 'An error occurred',
    };

    // Log based on status code
    if (status >= 500) {
      this.logger.error(
        {
          error: exception,
          request: {
            method: request.method,
            url: request.url,
            headers: request.headers,
            body: request.body,
          },
          response: errorResponse,
        },
        'Internal server error',
      );
    } else if (status >= 400) {
      this.logger.warn(
        {
          request: {
            method: request.method,
            url: request.url,
            headers: {
              'user-agent': request.headers['user-agent'],
              'content-type': request.headers['content-type'],
            },
          },
          response: errorResponse,
        },
        'Client error',
      );
    }

    response.status(status).json(errorResponse);
  }
}
