import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { DeliveryGateway } from './delivery.gateway';
import { Delivery } from './entities/delivery.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { SmsProvider } from '../notifications/providers/sms.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, Order, User]),
    AuthModule,
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryGateway, SmsProvider],
  exports: [DeliveryService, DeliveryGateway],
})
export class DeliveryModule {}