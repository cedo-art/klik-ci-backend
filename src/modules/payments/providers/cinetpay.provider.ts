import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class CinetpayProvider {
  private readonly apiKey = process.env.CINETPAY_API_KEY || 'test_api_key';
  private readonly siteId = process.env.CINETPAY_SITE_ID || 'test_site_id';
  private readonly baseUrl = 'https://api-checkout.cinetpay.com/v2';
  private readonly notifyUrl = process.env.CINETPAY_NOTIFY_URL || 'http://localhost:4000/api/v1/payments/webhook/cinetpay';
  private readonly returnUrl = process.env.CINETPAY_RETURN_URL || 'http://localhost:4000/payment-result';

  async initiatePayment(params: {
    transactionId: string;
    amount: number;
    description: string;
    customerName: string;
    customerPhone: string;
  }) {
    try {
      const response = await axios.post(`${this.baseUrl}/payment`, {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: params.transactionId,
        amount: params.amount,
        currency: 'XOF',
        description: params.description,
        customer_name: params.customerName,
        customer_phone_number: params.customerPhone,
        notify_url: this.notifyUrl,
        return_url: this.returnUrl,
        channels: 'ALL',
        lang: 'fr',
      });

      return response.data;
    } catch (error) {
      throw new Error(`CinetPay error: ${error.message}`);
    }
  }

  async verifyTransaction(transactionId: string) {
    try {
      const response = await axios.post(`${this.baseUrl}/payment/check`, {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: transactionId,
      });

      return response.data;
    } catch (error) {
      throw new Error(`CinetPay verify error: ${error.message}`);
    }
  }

  verifyWebhookSignature(data: any): boolean {
    // En production : vérifier la signature HMAC
    // Pour le dev : retourner true
    return true;
  }
}