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

import {
  LegacyProxyService,
  ProxyRequest,
  ProxyResponse,
} from './legacy-proxy.service';
import { RouteConfig, RouteConfigService } from './route-config.service';

@Controller({ version: '2' })
export class LegacyProxyController {
  constructor(
    private readonly legacyProxyService: LegacyProxyService,
    private readonly logger: PinoLogger,
    private readonly routeConfigService: RouteConfigService,
  ) {
    this.logger.setContext(LegacyProxyController.name);
  }

  @All('*path')
  async legacyProxyRequest(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const startTime = Date.now();
    let serviceName = '';
    let routeConfig: RouteConfig | null = null;

    try {
      // Match route
      routeConfig = this.routeConfigService.findRoute(req.path, req.method);

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

      const proxyResponse: ProxyResponse =
        await this.legacyProxyService.forwardRequest(
          serviceName,
          routeConfig.messagePattern,
          proxyRequest,
        );

      // this.setResponseHeaders(res, proxyResponse.headers);

      const duration = Date.now() - startTime;
      this.logger.info(
        {
          serviceName,
          method: req.method,
          statusCode: proxyResponse.statusCode,
          duration,
        },
        'Request proxied successfully',
      );

      if (this.isRedirect(proxyResponse)) {
        return res.redirect(
          proxyResponse.statusCode,
          proxyResponse.headers!.Location as string,
        );
      }

      const {
        headers,
        duration: ignoreDuration,
        ...cleanedResponse
      } = proxyResponse;

      res.status(cleanedResponse.statusCode ?? 200).json({
        ...cleanedResponse,
        success: true,
        statusCode: cleanedResponse.statusCode ?? 200,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const statusCode = this.resolveStatusCode(error);

      this.logger.error(
        {
          serviceName,
          method: req.method,
          statusCode,
          duration,
          error,
        },
        `Proxy error for ${serviceName}`,
      );

      // Return error directly so global exception filters or middleware can handle it.
      throw error;
    }
  }

  private sanitizeHeaders(
    headers: Record<string, unknown>,
  ): Record<string, string> {
    const sanitized: Record<string, string> = {};

    Object.entries(headers).forEach(([key, value]) => {
      if (typeof value !== 'string') return;

      const lowerKey = key.toLowerCase();

      // Filter out sensitive headers
      if (['authorization', 'cookie', 'x-api-key'].includes(lowerKey)) {
        return;
      }

      sanitized[lowerKey] = value;
    });

    sanitized['x-forwarded-by'] = 'api-gateway';
    sanitized['x-request-timestamp'] = Date.now().toString();

    return sanitized;
  }

  private setResponseHeaders(
    res: Response,
    headers?: Record<string, unknown>,
  ): void {
    if (!headers) return;

    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        res.setHeader(key, value as string);
      }
    }
  }

  private resolveStatusCode(error: unknown): number {
    if (
      typeof error === 'object' &&
      error !== null &&
      'getStatus' in error &&
      typeof (error as any)?.getStatus === 'function'
    ) {
      return (error as { getStatus: () => number }).getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private isRedirect(response: ProxyResponse): boolean {
    const { statusCode, headers } = response;
    const location = headers?.['Location'] ?? headers?.['location'];

    return (
      statusCode >= 300 &&
      statusCode < 400 &&
      typeof location === 'string' &&
      location.length > 0
    );
  }
}
