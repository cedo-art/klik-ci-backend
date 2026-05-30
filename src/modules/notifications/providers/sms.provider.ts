import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsProvider {
  private readonly apiKey = process.env.VONAGE_API_KEY || '';
  private readonly apiSecret = process.env.VONAGE_API_SECRET || '';
  private readonly whatsappFrom = '14157386102';

 private formatNumber(phone: string): string {
  let number = phone.replace(/[\+\s\-]/g, '');
  if (number.startsWith('00')) number = number.slice(2);
  
  // Si 12 chiffres : 225709977031 → 22509977031 (insère le 0 manquant)
  if (number.startsWith('225') && number.length === 12) {
    number = '225' + '0' + number.slice(4);
  }
  
  return number;
}

private getAlternativeNumber(number: string): string | null {
  if (number.startsWith('225') && number.length === 13) {
    // 2250709977031 → 225 + number[5:] = 225 + 09977031 = 22509977031
    return number.slice(0, 3) + number.slice(5);
  }
  if (number.startsWith('225') && number.length === 11) {
    // 22509977031 → 2250 + 7 + number[3:] = 2250709977031
    return number.slice(0, 4) + '7' + number.slice(3);
  }
  return null;
}

  private async sendWhatsApp(to: string, message: string) {
    try {
      const toFormatted = this.formatNumber(to);
      console.log(`📤 Envoi WhatsApp à ${toFormatted}...`);

      try {
        const response = await axios.post(
          'https://messages-sandbox.nexmo.com/v1/messages',
          {
            from: this.whatsappFrom,
            to: toFormatted,
            message_type: 'text',
            text: message,
            channel: 'whatsapp',
          },
          {
            auth: {
              username: this.apiKey,
              password: this.apiSecret,
            },
            headers: { 'Content-Type': 'application/json' },
          }
        );
        console.log(`✅ WhatsApp envoyé à ${toFormatted}`);
        return { success: true, data: response.data };
      } catch (firstError) {
        const alternative = this.getAlternativeNumber(toFormatted);
        if (!alternative) throw firstError;

        console.log(`🔄 Retry format alternatif: ${alternative}`);
        const response = await axios.post(
          'https://messages-sandbox.nexmo.com/v1/messages',
          {
            from: this.whatsappFrom,
            to: alternative,
            message_type: 'text',
            text: message,
            channel: 'whatsapp',
          },
          {
            auth: {
              username: this.apiKey,
              password: this.apiSecret,
            },
            headers: { 'Content-Type': 'application/json' },
          }
        );
        console.log(`✅ WhatsApp envoyé à ${alternative} (alternatif)`);
        return { success: true, data: response.data };
      }
    } catch (error) {
      console.error('❌ WhatsApp error:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async sendSms(to: string, message: string) {
    return this.sendWhatsApp(to, message);
  }

  async sendOtp(phone: string, code: string) {
    const message = `🔐 *Klik CI* — Votre code de vérification : *${code}*\nValable 10 minutes.\n\nNe partagez ce code avec personne.`;
    return this.sendWhatsApp(phone, message);
  }

  async sendOrderConfirmation(phone: string, orderId: string, total: number) {
    const message = `✅ *Klik CI* — Commande confirmée !\n\n📦 Ref: #${orderId.slice(-6).toUpperCase()}\n💰 Total: *${total.toLocaleString()} FCFA*\n\n🛺 Un tricycle Klik vous livrera bientôt !`;
    return this.sendWhatsApp(phone, message);
  }

  async sendDeliveryUpdate(phone: string, status: string, eta?: number) {
    let message = '';
    switch (status) {
      case 'assigned':
        message = `🛺 *Klik CI* — Bonne nouvelle !\n\nUn livreur Klik a été assigné à votre commande.\nPréparez-vous à recevoir votre bouteille !`;
        break;
      case 'picked_up':
        message = `⛽ *Klik CI* — Votre bouteille est chargée !\n\nLe livreur part de la station vers chez vous.${eta ? `\n⏱ Arrivée estimée : *${eta} min*` : ''}`;
        break;
      case 'en_route_client':
        message = `🔥 *Klik CI* — Votre livreur est en route !${eta ? `\n⏱ Arrivée dans *${eta} min*` : ''}\n\n🛺 Restez disponible pour recevoir votre livraison.`;
        break;
      case 'delivered':
        message = `🎉 *Klik CI* — Livraison effectuée !\n\nVotre bouteille de gaz a été livrée avec succès.\nMerci de votre confiance 🙏\n\n❓ Problème ? Appelez le *+225 05 00 00 00*`;
        break;
      case 'cancelled':
        message = `❌ *Klik CI* — Commande annulée.\n\nNous sommes désolés pour la gêne occasionnée.\nPour toute question : *+225 05 00 00 00*`;
        break;
      default:
        message = `📦 *Klik CI* — Mise à jour de votre commande.\nStatut : ${status}`;
    }
    return this.sendWhatsApp(phone, message);
  }

  async sendDeliveryConfirmation(phone: string, productName: string) {
    const message = `🎉 *Klik CI* — Livraison confirmée !\n\n✅ Votre bouteille  *${productName}* a été livré avec succès.\nMerci de votre confiance 🙏\n\n Un problème ? Appelez le *+225 05 00 00 00*\n\n`;
    return this.sendWhatsApp(phone, message);
  }
}