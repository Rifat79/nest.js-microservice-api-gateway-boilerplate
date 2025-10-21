import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import { PinoLogger } from 'nestjs-pino';

enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerData {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  successCount: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly monitoringPeriod: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.failureThreshold = this.configService.get(
      'circuitBreaker.failureThreshold',
      5,
    );
    this.resetTimeout = this.configService.get(
      'circuitBreaker.resetTimeout',
      1000,
    );
    this.monitoringPeriod = this.configService.get(
      'circuitBreaker.monitoringPeriod',
      120000,
    );
  }

  async isOpen(key: string): Promise<boolean> {
    const data = await this.getCircuitBreakerData(key);
    const now = Date.now();

    switch (data.state) {
      case CircuitBreakerState.OPEN:
        if (now >= data.nextAttemptTime) {
          // Transition to half-open
          await this.setState(key, CircuitBreakerState.HALF_OPEN);
          this.logger.info(
            { key },
            'Circuit breaker transitioned to HALF_OPEN',
          );
          return false;
        }
        return true;

      case CircuitBreakerState.HALF_OPEN:
        return false;

      case CircuitBreakerState.CLOSED:
      default:
        return false;
    }
  }

  async recordSuccess(key: string): Promise<void> {
    const data = await this.getCircuitBreakerData(key);

    if (data.state === CircuitBreakerState.HALF_OPEN) {
      // Transition back to closed after successful request in half-open state
      await this.setState(key, CircuitBreakerState.CLOSED, {
        failureCount: 0,
        successCount: data.successCount + 1,
      });

      this.logger.info(
        { key },
        'Circuit breaker transitioned to CLOSED after successful request',
      );

      this.eventEmitter.emit('circuit-breaker.closed', {
        key,
        previousState: CircuitBreakerState.HALF_OPEN,
      });
    } else if (data.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on successful request
      if (data.failureCount > 0) {
        await this.setState(key, CircuitBreakerState.CLOSED, {
          failureCount: 0,
          successCount: data.successCount + 1,
        });
      }
    }
  }

  async recordFailure(key: string): Promise<void> {
    const data = await this.getCircuitBreakerData(key);
    const now = Date.now();
    const newFailureCount = data.failureCount + 1;

    if (data.state === CircuitBreakerState.HALF_OPEN) {
      // Transition back to open on failure in half-open state
      await this.setState(key, CircuitBreakerState.OPEN, {
        failureCount: newFailureCount,
        lastFailureTime: now,
        nextAttemptTime: now + this.resetTimeout,
      });

      this.logger.warn(
        { key },
        'Circuit breaker transitioned to OPEN from HALF_OPEN due to failure',
      );

      this.eventEmitter.emit('circuit-breaker.opened', {
        key,
        failureCount: newFailureCount,
        previousState: CircuitBreakerState.HALF_OPEN,
      });
    } else if (
      data.state === CircuitBreakerState.CLOSED &&
      newFailureCount >= this.failureThreshold
    ) {
      // Transition to open when failure threshold is reached
      await this.setState(key, CircuitBreakerState.OPEN, {
        failureCount: newFailureCount,
        lastFailureTime: now,
        nextAttemptTime: now + this.resetTimeout,
      });

      this.logger.warn(
        {
          key,
          failureCount: newFailureCount,
          threshold: this.failureThreshold,
        },
        'Circuit breaker opened due to failure threshold reached',
      );

      this.eventEmitter.emit('circuit-breaker.opened', {
        key,
        failureCount: newFailureCount,
        threshold: this.failureThreshold,
        previousState: CircuitBreakerState.CLOSED,
      });
    } else {
      // Just increment failure count
      await this.setState(key, data.state, {
        failureCount: newFailureCount,
        lastFailureTime: now,
      });
    }
  }

  async getState(key: string): Promise<CircuitBreakerState> {
    const data = await this.getCircuitBreakerData(key);
    return data.state;
  }

  async getStats(key: string): Promise<CircuitBreakerData> {
    return this.getCircuitBreakerData(key);
  }

  async getAllStats(): Promise<Map<string, CircuitBreakerData>> {
    // This would need cache scanning functionality
    // For now, return empty map - implement based on your cache system
    return new Map();
  }

  private async getCircuitBreakerData(
    key: string,
  ): Promise<CircuitBreakerData> {
    const cacheKey = `circuit_breaker:${key}`;
    let data = await this.cacheManager.get<CircuitBreakerData>(cacheKey);

    if (!data) {
      data = {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
        successCount: 0,
      };
      await this.cacheManager.set(cacheKey, data, this.monitoringPeriod);
    }

    return data;
  }

  private async setState(
    key: string,
    state: CircuitBreakerState,
    updates: Partial<CircuitBreakerData> = {},
  ): Promise<void> {
    const cacheKey = `circuit_breaker:${key}`;
    const currentData = await this.getCircuitBreakerData(key);

    const newData: CircuitBreakerData = {
      ...currentData,
      ...updates,
      state,
    };

    await this.cacheManager.set(cacheKey, newData, this.monitoringPeriod);
  }
}
