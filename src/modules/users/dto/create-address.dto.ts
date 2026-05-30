import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  label: string;

  @IsString()
  fullAddress: string;

  @IsNumber()
  @Min(-90) @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180) @Max(180)
  longitude: number;

  @IsOptional()
  @IsString()
  quartier?: string;

  @IsOptional()
  @IsString()
  commune?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}