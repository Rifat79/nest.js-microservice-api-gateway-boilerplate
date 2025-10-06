import {
  All,
  Controller,
  HttpException,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { LegacyProxyService, ProxyRequest } from './legacy-proxy.service';
import { RouteConfigService } from './route-config.service';

@Controller({ version: '2' }) // This controller handles everything under /api/v2
export class LegacyProxyController {
  constructor(
    private readonly legacyProxyService: LegacyProxyService,
    private readonly logger: PinoLogger,
    private readonly routeConfigService: RouteConfigService,
  ) {
    this.logger.setContext(LegacyProxyController.name);
  }

  @All('*wildcard')
  async legacyProxyRequest(@Req() req: Request, @Res() res: Response) {
    let serviceName = '';
    const startTime = Date.now();

    try {
      // Find matching route configuration
      const routeConfig = this.routeConfigService.findRoute(
        req.path,
        req.method,
      );

      if (!routeConfig) {
        throw new HttpException(
          `Route not found: ${req.method} ${req.path}`,
          HttpStatus.NOT_FOUND,
        );
      }

      serviceName = routeConfig.service;

      const proxyRequest: ProxyRequest = {
        method: req.method,
        url: req.path,
        headers: this.sanitizeHeaders(req.headers),
        body: req.body as Record<string, unknown>,
        query: req.query,
        params: req.params,
      };

      const response = await this.legacyProxyService.forwardRequest(
        serviceName,
        routeConfig.messagePattern,
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
