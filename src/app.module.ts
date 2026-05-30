import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticModule } from './modules/analytic/analytic.module';
import { DriversModule } from './modules/drivers/drivers.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

  TypeOrmModule.forRoot({
  type: 'postgres',
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME     || 'gazexpress_db',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true,
  logging: false,
}),

    UsersModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    DeliveryModule,
    PaymentsModule,
    NotificationsModule,
    AnalyticModule,
    DriversModule,  
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}