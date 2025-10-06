import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CircuitBreakerService } from './circuit-breaker.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
