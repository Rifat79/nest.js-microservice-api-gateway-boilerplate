import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { BillingMessagePatterns } from 'src/common/enums/message-patterns';

export interface RouteConfig {
  service: string;
  baseUrl: string;
  path: string;
  messagePattern: string;
  methods: string[];
  requiresAuth: boolean;
  rateLimit?: {
    ttl: number;
    limit: number;
  };
}

export interface ServiceEndpoint {
  name: string;
  baseUrl: string;
  healthPath: string;
}

@Injectable()
export class RouteConfigService {
  private readonly routes: Map<string, RouteConfig> = new Map();
  private readonly services: Map<string, ServiceEndpoint> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RouteConfigService.name);
    this.initializeRoutes();
    this.initializeServices();
  }

  private initializeServices() {
    const services: ServiceEndpoint[] = [
      {
        name: 'selfhost',
        baseUrl:
          this.configService.get('services.selfhost.host') +
          ':' +
          this.configService.get('services.selfhost.port'),
        healthPath: '/api/health',
      },
      {
        name: 'billing',
        baseUrl:
          this.configService.get('services.billing.host') +
          ':' +
          this.configService.get('services.billing.port'),
        healthPath: '/api/health',
      },
    ];

    services.forEach((service) => {
      this.services.set(service.name, service);
    });

    this.logger.info(`🔧 Initialized ${services.length} service endpoints`);
  }

  private initializeRoutes() {
    // Define route mappings
    const routeConfigs: RouteConfig[] = [
      {
        service: 'billing',
        baseUrl: '',
        path: '/api/v2/test/:anything',
        messagePattern: BillingMessagePatterns.TEST_ANYTHING,
        methods: ['GET'],
        requiresAuth: false,
      },
      {
        service: 'billing',
        baseUrl: '',
        path: '/api/v2/gpdob/charge',
        messagePattern: BillingMessagePatterns.CREATE_SUBSCRIPTION,
        methods: ['POST'],
        requiresAuth: false,
      },
    ];

    routeConfigs.forEach((config) => {
      const key = `${config.path}`;
      this.routes.set(key, config);
    });

    this.logger.info(
      `📋 Initialized ${routeConfigs.length} route configurations`,
    );
  }

  findRoute(path: string, method: string): RouteConfig | null {
    // Direct match first
    const directMatch = this.routes.get(path);
    if (directMatch && directMatch.methods.includes(method.toUpperCase())) {
      return directMatch;
    }

    // Pattern matching for dynamic routes
    for (const [routePath, config] of this.routes.entries()) {
      if (
        this.isPathMatch(path, routePath) &&
        config.methods.includes(method.toUpperCase())
      ) {
        return config;
      }
    }

    return null;
  }

  getServiceEndpoint(serviceName: string): ServiceEndpoint | null {
    return this.services.get(serviceName) || null;
  }

  getAllServices(): ServiceEndpoint[] {
    return Array.from(this.services.values());
  }

  private isPathMatch(requestPath: string, routePath: string): boolean {
    // Convert route pattern to regex
    // Handle dynamic segments like /api/v1/user/:id
    const regexPattern = routePath
      .replace(/:[^/]+/g, '[^/]+') // Replace :param with regex
      .replace(/\*/g, '.*'); // Replace * with regex

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(requestPath);
  }
}
