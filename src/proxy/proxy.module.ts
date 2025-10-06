import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from 'src/circuit-breaker/circuit-breaker.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [CircuitBreakerModule],
  controllers: [ProxyController],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
