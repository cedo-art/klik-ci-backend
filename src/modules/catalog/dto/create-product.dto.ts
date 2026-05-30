import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  weightKg: number;

  @IsInt()
  @Min(0)
  priceFcfa: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}