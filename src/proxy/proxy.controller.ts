import { All, Controller, Param, Req, Res } from '@nestjs/common';

import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ProxyRequest, ProxyService } from './proxy.service';

@Controller('gateway')
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly logger: PinoLogger,
    // private readonly metricsService: MetricsService,
  ) {
    this.logger.setContext(ProxyController.name);
  }

  @All(':serviceName/*')
  async proxyRequest(
    @Param('serviceName') serviceName: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const startTime = Date.now();

    try {
      // Extract the remaining path after serviceName
      const fullPath = req.path;
      const servicePrefix = `/api/v1/services/${serviceName}`;
      const targetPath = fullPath.replace(servicePrefix, '') || '/';

      const proxyRequest: ProxyRequest = {
        method: req.method,
        url: targetPath,
        headers: this.sanitizeHeaders(req.headers),
        body: req.body,
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
          res.setHeader(key, value);
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

      res.status(response.statusCode).json(response.data);
    } catch (error) {
      const duration = Date.now() - startTime;
      const statusCode = error.getStatus?.() || 500;

      this.logger.error(
        { serviceName, method: req.method, statusCode, duration, err: error },
        `Proxy error for ${serviceName}`,
      );

      res.status(statusCode).json({
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
        path: req.path,
      });
    }
  }

  private sanitizeHeaders(headers: any): Record<string, any> {
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
