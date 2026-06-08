import { Injectable } from '@nestjs/common';
import admin from './firebase.config';

@Injectable()
export class SmsProvider {

  async sendOtp(phone: string, code: string): Promise<void> {
    // Firebase envoie le SMS automatiquement via verifyPhoneNumber
    // Le code est géré côté client avec Firebase SDK
    console.log(`OTP pour ${phone}: ${code}`);
  }

  async sendSms(to: string, message: string) {
    console.log(`SMS à ${to}: ${message}`);
  }

  async sendOrderConfirmation(phone: string, orderId: string, total: number) {
    console.log(`Confirmation commande ${orderId} à ${phone}`);
  }

  async sendDeliveryUpdate(phone: string, status: string, eta?: number) {
    console.log(`Update livraison ${status} à ${phone}`);
  }
}