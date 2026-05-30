import {
  Controller, Get, Post, Body,
  UseGuards, Request
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CinetpayWebhookDto } from './dto/cinetpay-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  initiatePayment(@Request() req, @Body() dto: InitiatePaymentDto) {
    return this.paymentsService.initiatePayment(req.user.id, dto);
  }

  @Post('webhook/cinetpay')
  handleWebhook(@Body() dto: CinetpayWebhookDto) {
    return this.paymentsService.handleWebhook(dto);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  getMyTransactions(@Request() req) {
    return this.paymentsService.getMyTransactions(req.user.id);
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  getWallet(@Request() req) {
    return this.paymentsService.getWallet(req.user.id);
  }

  @Post('wallet/topup')
  @UseGuards(JwtAuthGuard)
  topUpWallet(@Request() req, @Body('amount') amount: number) {
    return this.paymentsService.topUpWallet(req.user.id, amount);
  }
}