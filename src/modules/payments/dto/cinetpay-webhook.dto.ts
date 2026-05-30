import { IsString, IsOptional } from 'class-validator';

export class CinetpayWebhookDto {
  @IsString()
  cpm_trans_id: string;

  @IsString()
  cpm_site_id: string;

  @IsString()
  cpm_amount: string;

  @IsString()
  cpm_currency: string;

  @IsString()
  cpm_payment_date: string;

  @IsString()
  cpm_payment_time: string;

  @IsString()
  cpm_error_message: string;

  @IsString()
  cpm_result: string;

  @IsString()
  cpm_trans_status: string;

  @IsOptional()
  @IsString()
  cpm_phone_prefixe?: string;

  @IsOptional()
  @IsString()
  cel_phone_num?: string;
}