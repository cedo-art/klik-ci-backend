import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAddressDto {
  @IsString()
  label: string;

  @IsString()
  fullAddress: string;

  // @Type(() => Number) force la conversion string → number
  // au cas où l'app React Native envoie "5.3750" au lieu de 5.3750
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90) @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180) @Max(180)
  longitude?: number;

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