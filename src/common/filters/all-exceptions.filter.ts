import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

interface ErrorResponse {
  success: boolean;
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  requestId?: string;
  error: string;
  message: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // `getResponse()` can be string or object, so normalize carefully
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    // Extract error/message from response (handle string or object)
    let error = 'Unknown error';
    let message = 'An error occurred';

    if (typeof exceptionResponse === 'string') {
      error = exceptionResponse;
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      error = (exceptionResponse as Record<string, any>).error ?? error;
      message = (exceptionResponse as Record<string, any>).message ?? message;
    }

    const errorResponse: ErrorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      requestId: request.requestId,
      error,
      message,
    };

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
