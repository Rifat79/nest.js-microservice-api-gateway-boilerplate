import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientProxy } from '@nestjs/microservices';
import type { Cache } from 'cache-manager';
import { PinoLogger } from 'nestjs-pino';
import {
  catchError,
  defer,
  firstValueFrom,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';
import { CircuitBreakerService } from 'src/circuit-breaker/circuit-breaker.service';

// Define the expected structure of the error payload from your microservice's AllExceptionsFilter
interface StructuredRpcError {
  status: number; // The HTTP status code (e.g., 400, 404)
  message: string;
  [key: string]: any;
}

export interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, any>;
  params?: Record<string, any>;
  userId?: string;
  tenantId?: string;
}

interface ProxyPayload {
  headers: Record<string, any>;
  body?: any;
  query?: Record<string, any>;
  params?: Record<string, any>;
  userId?: string;
  tenantId?: string;
  timestamp: number;
  requestId?: string;
}

export interface ProxyResponse {
  statusCode: number;
  data: any;
  headers?: Record<string, unknown>;
  duration?: number;
}

@Injectable()
export class LegacyProxyService {
  private readonly serviceTimeouts: Map<string, number> = new Map();
  private readonly serviceClients: Map<string, ClientProxy> = new Map();

  constructor(
    @Inject('SELFHOST_SERVICE') private readonly selfhostClient: ClientProxy,
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,

    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
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

    // Initialize timeouts
    const services =
      this.configService.get<Record<string, { timeout: number }>>('services');
    if (services) {
      Object.entries(services).forEach(
        ([name, config]: [string, { timeout: number }]) => {
          this.serviceTimeouts.set(name, config.timeout);
        },
      );
    }
  }

  async forwardRequest(
    serviceName: string,
    messagePattern: string,
    request: ProxyRequest,
  ): Promise<ProxyResponse> {
    const startTime = Date.now();
    const requestId =
      typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : undefined;

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
      const pattern = messagePattern;
      const payload = this.buildRequestPayload(request);
      const requestTimeout = this.serviceTimeouts.get(serviceName) || 30000;

      // Forward request with timeout and error handling
      const response = (await firstValueFrom(
        client.send<ProxyResponse, ProxyPayload>(pattern, payload).pipe(
          timeout(requestTimeout),
          catchError((error) =>
            defer<Promise<void>>(async () => {
              console.log(
                '***********************',
                JSON.stringify(error),
                '%%%%%%%%%%%%%%%%%',
                error.error.message,
                '$$$$$$$$$$',
                error.error.status,
              );
              // Record failure for circuit breaker
              if (this.shouldRecordFailure(error)) {
                await this.circuitBreaker.recordFailure(circuitBreakerKey);
              }

              const errorMessage =
                typeof error === 'object' &&
                error !== null &&
                'message' in error
                  ? String((error as any).message)
                  : String(error);
              const errorStack =
                error instanceof Error ? error.stack : undefined;

              this.logger.error(
                {
                  requestId,
                  serviceName,
                  pattern,
                  error: errorMessage,
                  stack: errorStack,
                },
                'Service request failed',
              );

              this.eventEmitter.emit('service.request.failed', {
                serviceName,
                pattern,
                error: errorMessage,
                requestId,
              });

              if (this.isStructuredRpcError(error)) {
                console.log('>>>>>>>>>>>>>>>>>>>>>>>>', error);
                throw this.mapErrorToHttpResponse(error);
              }

              throw new ServiceUnavailableException(
                `Service ${serviceName} unavailable: ${errorMessage}`,
              );
            }),
          ),
        ),
      )) as ProxyResponse;

      console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>', { response });

      // Record success for circuit breaker
      await this.circuitBreaker.recordSuccess(circuitBreakerKey);

      const duration = Date.now() - startTime;
      const finalResponse: ProxyResponse = {
        ...response,
        duration,
      };

      // Cache successful GET responses
      if (request.method === 'GET' && response?.statusCode === 200) {
        await this.setCachedResponse(serviceName, request, finalResponse);
      }

      // Emit success event for monitoring
      this.eventEmitter.emit('service.request.success', {
        serviceName,
        pattern,
        duration,
        statusCode: response?.statusCode,
        requestId,
      });

      this.logger.info(
        {
          requestId,
          serviceName,
          pattern,
          statusCode: response?.statusCode,
          duration,
        },
        'Request forwarded successfully',
      );

      return finalResponse;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;

      if (error instanceof Error) {
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

        this.eventEmitter.emit('service.request.error', {
          serviceName,
          error: error.message,
          duration,
          requestId,
        });
      } else {
        this.logger.error(
          {
            requestId,
            serviceName,
            error: String(error),
            duration,
          },
          'Proxy request failed with non-Error type',
        );
      }

      if (!(error instanceof ServiceUnavailableException)) {
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
        client.send<{ status: string }, object>('health.check', {}).pipe(
          timeout(5000),
          catchError(() => throwError(() => new Error('Health check failed'))),
        ),
      );

      return response && response.status === 'ok';
    } catch (error: unknown) {
      this.logger.warn(
        {
          serviceName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Service health check failed',
      );
      return false;
    }
  }

  private buildRequestPayload(request: ProxyRequest): ProxyPayload {
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
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Cache get error',
      );
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
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Cache set error',
      );
    }
  }

  private generateCacheKey(serviceName: string, request: ProxyRequest): string {
    const queryString = request.query ? JSON.stringify(request.query) : '';
    const userContext = request.tenantId || 'global';
    return `proxy:${serviceName}:${userContext}:${request.url}:${queryString}`;
  }

  private shouldRecordFailure(error: unknown): boolean {
    if (error instanceof TimeoutError) {
      return true;
    }

    if (error instanceof HttpException) {
      const status = error.getStatus?.();

      if (typeof status === 'number') {
        // Count 5xx and 429 as failures
        if (status >= 500 || status === 429) {
          return true;
        }
        return false;
      }

      return false;
    }

    if (error instanceof ServiceUnavailableException) {
      return true;
    }

    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;

      if (typeof code === 'string') {
        const networkErrorCodes = [
          'ECONNREFUSED',
          'ECONNRESET',
          'ENOTFOUND',
          'ETIMEDOUT',
          'EHOSTUNREACH',
          'EPIPE',
          'ECONNABORTED',
          'ENETUNREACH',
        ];

        if (networkErrorCodes.includes(code)) {
          return true;
        }
      }
    }

    // Fallback: unknown errors are not considered failures
    return false;
  }

  private getCacheTtl(serviceName: string, url: string): number {
    // Default TTLs by service
    const defaultTtls: Record<string, number> = {
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

  private mapErrorToHttpResponse(error: any) {
    const e =
      typeof error === 'object' && 'error' in error ? error.error : error;
    const { status, message } = e;
    console.log('+++++++++++++++++++', status, message);

    switch (status) {
      case 400:
        return new BadRequestException({ message });
      case 401:
        return new UnauthorizedException({ message });
      case 403:
        return new ForbiddenException({ message });
      case 404:
        return new NotFoundException({ message });
      case 409:
        return new ConflictException({ message });
      case 500:
        return new InternalServerErrorException({ message });
      default:
        return new HttpException({ message }, status);
    }
  }

  private isStructuredRpcError(error: any) {
    const e = error?.error || error;
    return e && typeof e === 'object' && 'status' in e && 'message' in e;
  }
}
