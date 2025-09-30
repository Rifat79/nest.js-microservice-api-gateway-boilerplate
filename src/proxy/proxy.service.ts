import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import type { Cache } from 'cache-manager';
import { PinoLogger } from 'nestjs-pino';
import { catchError, firstValueFrom, throwError, timeout } from 'rxjs';
import { CircuitBreakerService } from './circuit-breaker.service';
// import { LoadBalancerService } from './load-balancer.service';

export interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, any>;
  body?: any;
  query?: Record<string, any>;
  params?: Record<string, any>;
  userId?: string;
  tenantId?: string;
}

export interface ProxyResponse {
  statusCode: number;
  data: any;
  headers?: Record<string, any>;
  duration?: number;
}

@Injectable()
export class ProxyService {
  private readonly serviceTimeouts: Map<string, number> = new Map();
  private readonly serviceClients: Map<string, ClientProxy> = new Map();

  constructor(
    @Inject('SELFHOST_SERVICE') private readonly selfhostClient: ClientProxy,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,

    @Inject('WEBHOOK_SERVICE') private readonly webhookClient: ClientProxy,
    @Inject('NOTIFICATION_SERVICE')
    private readonly notificationClient: ClientProxy,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    // private readonly loadBalancer: LoadBalancerService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly logger: PinoLogger,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializeServices();
  }

  private initializeServices() {
    // Initialize service clients map
    this.serviceClients.set('selfhost', this.selfhostClient);
    this.serviceClients.set('billing', this.billingClient);
    this.serviceClients.set('notification', this.notificationClient);
    this.serviceClients.set('webhook', this.webhookClient);

    // Initialize timeouts
    console.log('Config Services:', this.configService.get('services'));
    const services = this.configService.get('services');
    Object.entries(services).forEach(([name, config]: [string, any]) => {
      this.serviceTimeouts.set(name, config.timeout);
    });
  }

  async forwardRequest(
    serviceName: string,
    request: ProxyRequest,
  ): Promise<ProxyResponse> {
    const startTime = Date.now();
    const requestId = request.headers['x-request-id'];

    this.logger.info(
      {
        requestId,
        serviceName,
        method: request.method,
        url: request.url,
        userId: request.userId,
        tenantId: request.tenantId,
      },
      'Forwarding request to service',
    );

    try {
      // Validate service name
      if (!this.serviceClients.has(serviceName)) {
        throw new BadRequestException(`Unknown service: ${serviceName}`);
      }

      // Check cache for GET requests
      let cachedResponse: ProxyResponse | null = null;
      if (request.method === 'GET') {
        cachedResponse = await this.getCachedResponse(serviceName, request);
        if (cachedResponse) {
          this.logger.debug(
            { requestId, serviceName },
            'Returning cached response',
          );
          return {
            ...cachedResponse,
            duration: Date.now() - startTime,
          };
        }
      }

      // Check circuit breaker
      const circuitBreakerKey = `${serviceName}_${request.method}_${request.url}`;

      if (await this.circuitBreaker.isOpen(circuitBreakerKey)) {
        this.logger.warn(
          { requestId, serviceName, circuitBreakerKey },
          'Circuit breaker is open',
        );
        throw new ServiceUnavailableException(
          `Service ${serviceName} is currently unavailable`,
        );
      }

      // Get client
      const client = this.serviceClients.get(serviceName);

      if (!client) {
        // Handle the undefined client case, throw or return early
        throw new Error('Client is undefined');
      }

      // Build message pattern and payload
      const pattern = this.buildMessagePattern(request.method, request.url);
      const payload = this.buildRequestPayload(request);
      const requestTimeout = this.serviceTimeouts.get(serviceName) || 30000;

      // Forward request with timeout and error handling
      const response = await firstValueFrom(
        client.send(pattern, payload).pipe(
          timeout(requestTimeout),
          catchError((error) => {
            this.circuitBreaker.recordFailure(circuitBreakerKey);
            this.logger.error(
              {
                requestId,
                serviceName,
                pattern,
                error: error.message,
                stack: error.stack,
              },
              'Service request failed',
            );

            // Emit failure event for monitoring
            this.eventEmitter.emit('service.request.failed', {
              serviceName,
              pattern,
              error: error.message,
              requestId,
            });

            return throwError(
              () =>
                new ServiceUnavailableException(
                  `Service ${serviceName} unavailable: ${error.message}`,
                ),
            );
          }),
        ),
      );

      // Record success for circuit breaker
      this.circuitBreaker.recordSuccess(circuitBreakerKey);

      const duration = Date.now() - startTime;
      const finalResponse: ProxyResponse = {
        ...response,
        duration,
      };

      // Cache successful GET responses
      if (request.method === 'GET' && response.statusCode === 200) {
        await this.setCachedResponse(serviceName, request, finalResponse);
      }

      // Emit success event for monitoring
      this.eventEmitter.emit('service.request.success', {
        serviceName,
        pattern,
        duration,
        statusCode: response.statusCode,
        requestId,
      });

      this.logger.info(
        {
          requestId,
          serviceName,
          pattern,
          statusCode: response.statusCode,
          duration,
        },
        'Request forwarded successfully',
      );

      return finalResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        {
          requestId,
          serviceName,
          error: error.message,
          duration,
          stack: error.stack,
        },
        'Proxy request failed',
      );

      // Emit error event for monitoring
      this.eventEmitter.emit('service.request.error', {
        serviceName,
        error: error.message,
        duration,
        requestId,
      });

      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException(
        `Service ${serviceName} temporarily unavailable`,
      );
    }
  }

  async healthCheck(serviceName: string): Promise<boolean> {
    try {
      const client = this.serviceClients.get(serviceName);
      if (!client) {
        return false;
      }

      const response = await firstValueFrom(
        client.send('health.check', {}).pipe(
          timeout(5000),
          catchError(() => throwError(() => new Error('Health check failed'))),
        ),
      );

      return response && response.status === 'ok';
    } catch (error) {
      this.logger.warn(
        { serviceName, error: error.message },
        'Service health check failed',
      );
      return false;
    }
  }

  private buildMessagePattern(method: string, url: string): string {
    // Remove leading slash and replace slashes with dots
    const cleanUrl = url.replace(/^\/+/, '').replace(/\//g, '.');
    // Remove query parameters and fragments
    const pathOnly = cleanUrl.split('?')[0].split('#')[0];
    return `${method.toLowerCase()}.${pathOnly || 'root'}`;
  }

  private buildRequestPayload(request: ProxyRequest): any {
    return {
      headers: this.sanitizeHeaders(request.headers),
      body: request.body,
      query: request.query,
      params: request.params,
      userId: request.userId,
      tenantId: request.tenantId,
      timestamp: Date.now(),
      requestId: request.headers['x-request-id'],
    };
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };

    // Remove sensitive headers that shouldn't be forwarded
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    delete sanitized.host;

    // Add forwarding metadata
    sanitized['x-forwarded-by'] = 'api-gateway';
    sanitized['x-forwarded-at'] = new Date().toISOString();

    return sanitized;
  }

  private async getCachedResponse(
    serviceName: string,
    request: ProxyRequest,
  ): Promise<ProxyResponse | null> {
    try {
      const cacheKey = this.generateCacheKey(serviceName, request);
      return (await this.cacheManager.get<ProxyResponse>(cacheKey)) ?? null;
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Cache get error');
      return null;
    }
  }

  private async setCachedResponse(
    serviceName: string,
    request: ProxyRequest,
    response: ProxyResponse,
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(serviceName, request);
      const cacheTtl = this.getCacheTtl(serviceName, request.url);
      await this.cacheManager.set(cacheKey, response, cacheTtl);
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Cache set error');
    }
  }

  private generateCacheKey(serviceName: string, request: ProxyRequest): string {
    const queryString = request.query ? JSON.stringify(request.query) : '';
    const userContext = request.tenantId || 'global';
    return `proxy:${serviceName}:${userContext}:${request.url}:${queryString}`;
  }

  private getCacheTtl(serviceName: string, url: string): number {
    // Default TTLs by service
    const defaultTtls = {
      selfhost: 300000, // 5 minutes
      billing: 60000, // 1 minute
      notification: 30000, // 30 seconds
      webhook: 120000, // 2 minutes
    };

    let baseTtl = defaultTtls[serviceName] || 60000;

    // Longer TTL for certain endpoints
    if (url.includes('/config') || url.includes('/settings')) {
      baseTtl *= 4;
    }

    // Shorter TTL for user-specific data
    if (url.includes('/me') || url.includes('/profile')) {
      baseTtl = Math.min(baseTtl, 30000); // Max 30 seconds
    }

    return baseTtl;
  }
}
