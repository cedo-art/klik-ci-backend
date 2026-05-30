import { IsString, IsPhoneNumber } from 'class-validator';

export class SendOtpDto {
  @IsString()
  phone: string;
}