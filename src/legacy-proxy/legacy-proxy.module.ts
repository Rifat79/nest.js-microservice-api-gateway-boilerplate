import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from 'src/circuit-breaker/circuit-breaker.module';
import { LegacyProxyController } from './legacy-proxy.controller';
import { LegacyProxyService } from './legacy-proxy.service';
import { RouteConfigService } from './route-config.service';

@Module({
  imports: [CircuitBreakerModule],
  controllers: [LegacyProxyController],
  providers: [LegacyProxyService, RouteConfigService],
})
export class LegacyProxyModule {}
