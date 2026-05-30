import { IsUUID, IsEnum, IsInt, Min } from 'class-validator';
import { PaymentMethod } from '../entities/transaction.entity';

export class InitiatePaymentDto {
  @IsUUID()
  orderId: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsInt()
  @Min(100)
  amount: number;
}