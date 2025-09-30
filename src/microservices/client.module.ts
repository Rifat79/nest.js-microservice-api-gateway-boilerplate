import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'SELFHOST_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>(
              'SELFHOST_SERVICE_HOST',
              'localhost',
            ),
            port: configService.get<number>('SELFHOST_SERVICE_PORT', 3001),
          },
        }),
      },
      {
        name: 'BILLING_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>(
              'BILLING_SERVICE_HOST',
              'localhost',
            ),
            port: configService.get<number>('BILLING_SERVICE_PORT', 3002),
          },
        }),
      },
      {
        name: 'NOTIFICATION_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>(
              'NOTIFICATION_SERVICE_HOST',
              'localhost',
            ),
            port: configService.get<number>('NOTIFICATION_SERVICE_PORT', 3003),
          },
        }),
      },
      {
        name: 'WEBHOOK_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>(
              'WEBHOOK_SERVICE_HOST',
              'localhost',
            ),
            port: configService.get<number>('WEBHOOK_SERVICE_PORT', 3004),
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule], // Make clients available globally
})
export class MicroservicesClientsModule {}
