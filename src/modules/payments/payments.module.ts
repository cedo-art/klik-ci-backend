import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CinetpayProvider } from './providers/cinetpay.provider';
import { Transaction } from './entities/transaction.entity';
import { Wallet } from './entities/wallet.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Wallet, Order, User]),
    AuthModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, CinetpayProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}