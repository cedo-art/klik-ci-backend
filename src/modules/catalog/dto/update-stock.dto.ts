import { IsUUID, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateStockDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsInt()
  alertThreshold?: number;
}