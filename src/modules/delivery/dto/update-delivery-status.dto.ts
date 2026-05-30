import { IsEnum } from 'class-validator';
import { DeliveryStatus } from '../entities/delivery.entity';

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}