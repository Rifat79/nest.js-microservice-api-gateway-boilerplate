import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IncomingMessage, OutgoingMessage } from 'http';

interface HttpRequest extends IncomingMessage {
  remoteAddress?: string;
  remotePort?: number;
  body?: Record<string, unknown>;
  headers: IncomingMessage['headers'] & {
    host?: string;
    'user-agent'?: string;
    'content-type'?: string;
    authorization?: string;
    'x-api-key'?: string;
    'x-request-id'?: string;
    cookie?: string;
  };
}

interface HttpResponse extends OutgoingMessage {
  statusCode?: number;
  headers?: {
    'content-type'?: string;
    'content-length'?: string;
  };
}

interface ErrObject extends Error {
  type?: string;
}

export const createLoggerConfig = (configService: ConfigService) => ({
  pinoHttp: {
    level: configService.get<string>('LOG_LEVEL', 'info'),
    transport:
      configService.get<string>('NODE_ENV') !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              levelFirst: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
              messageFormat: '{req.method} {req.url} - {msg}',
              ignore: 'pid,hostname,req,res,responseTime',
              errorLikeObjectKeys: ['err', 'error'],
            },
          }
        : undefined,

    serializers: {
      req: (req: HttpRequest) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        headers: {
          host: req.headers?.host,
          'user-agent': req.headers?.['user-agent'],
          'content-type': req.headers?.['content-type'],
          authorization: req.headers?.authorization ? '[REDACTED]' : undefined,
          'x-api-key': req.headers?.['x-api-key'] ? '[REDACTED]' : undefined,
        },
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      }),
      res: (res: HttpResponse) => ({
        statusCode: res.statusCode,
        headers: {
          'content-type': res.headers?.['content-type'],
          'content-length': res.headers?.['content-length'],
        },
      }),
      err: (err: ErrObject) => ({
        type: err.type,
        message: err.message,
        stack: err.stack,
      }),
    },

    customProps: (req: HttpRequest) => ({
      requestId: req.headers['x-request-id'],
    }),

    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers.cookie',
        'req.body.password',
        'req.body.token',
      ],
      censor: '[REDACTED]',
    },

    genReqId: (req: HttpRequest) =>
      req?.headers['x-request-id'] ?? randomUUID(),
  },
});
