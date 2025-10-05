import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ProxyController } from './proxy.controller';
import { ProxyControllerTmp } from './proxy.controller.tmp';
import { ProxyService } from './proxy.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [ProxyController, ProxyControllerTmp],
  providers: [ProxyService, CircuitBreakerService],
  exports: [ProxyService],
})
export class ProxyModule {}
