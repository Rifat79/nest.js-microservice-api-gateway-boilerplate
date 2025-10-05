import { All, Controller, Param, Req, Res } from '@nestjs/common';

import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ProxyRequest, ProxyService } from './proxy.service';

@Controller({ version: '2', path: 'gateway' })
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ProxyController.name);
  }

  @All(':serviceName/{*splat}')
  async proxyRequest(
    @Param('serviceName') serviceName: string,
    @Param('splat') splat: string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const startTime = Date.now();

    try {
      const targetPath = '/' + (splat?.join('/') || '');

      const proxyRequest: ProxyRequest = {
        method: req.method,
        url: targetPath,
        headers: this.sanitizeHeaders(req.headers),
        body: req.body as Record<string, unknown>,
        query: req.query,
        params: req.params,
      };

      const response = await this.proxyService.forwardRequest(
        serviceName,
        proxyRequest,
      );

      // Set response headers
      if (response.headers) {
        Object.entries(response.headers).forEach(([key, value]) => {
          res.setHeader(key, value as string);
        });
      }

      // Record metrics
      const duration = Date.now() - startTime;
      this.logger.info(
        {
          serviceName,
          method: req.method,
          statusCode: response.statusCode,
          duration,
        },
        'Request proxied successfully',
      );

      // ✅ Handle redirect if needed
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers?.Location
      ) {
        return res.redirect(response.statusCode, response.headers.Location);
      }

      res.status(response.statusCode).json(response.data);
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      let statusCode = 500;

      if (
        typeof error === 'object' &&
        error !== null &&
        'getStatus' in error &&
        typeof (error as Record<string, unknown>)?.getStatus === 'function'
      ) {
        statusCode = (error as { getStatus: () => number }).getStatus();
      }

      this.logger.error(
        { serviceName, method: req.method, statusCode, duration, err: error },
        `Proxy error for ${serviceName}`,
      );

      throw error;
    }
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };

    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];

    // Add request tracking
    sanitized['x-forwarded-by'] = 'api-gateway';
    sanitized['x-request-timestamp'] = Date.now().toString();

    return sanitized;
  }
}
