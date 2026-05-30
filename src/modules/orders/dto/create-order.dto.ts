import { IsUUID, IsEnum, IsArray, IsInt, IsOptional, IsDateString, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from '../entities/order.entity';

export class OrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  returnEmpty?: boolean;
}

export class CreateOrderDto {
  @IsUUID()
  depotId: string;

  @IsUUID()
  deliveryAddressId: string;

  @IsEnum(OrderType)
  type: OrderType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}