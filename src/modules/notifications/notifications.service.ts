import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType, NotificationChannel } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { FirebaseProvider } from './providers/firebase.provider';
import { SmsProvider } from './providers/sms.provider';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private firebaseProvider: FirebaseProvider,
    private smsProvider: SmsProvider,
  ) {}

  async sendNotification(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    channel?: NotificationChannel;
    data?: Record<string, string>;
    fcmToken?: string;
  }) {
    const user = await this.usersRepository.findOne({
      where: { id: params.userId },
    });

    const notification = new Notification();
    if (user) notification.user = user;
    notification.type = params.type;
    notification.title = params.title;
    notification.body = params.body;
    notification.channel = params.channel || NotificationChannel.PUSH;
    notification.data = params.data ? JSON.stringify(params.data) : null;

    if (params.channel === NotificationChannel.SMS && user) {
      await this.smsProvider.sendSms(user.phone, params.body);
      notification.sentAt = new Date();
    }

    if (params.channel === NotificationChannel.PUSH && params.fcmToken) {
      await this.firebaseProvider.sendPushNotification({
        token: params.fcmToken,
        title: params.title,
        body: params.body,
        data: params.data,
      });
      notification.sentAt = new Date();
    }

    return this.notificationsRepository.save(notification);
  }

  async notifyOrderConfirmed(userId: string, orderId: string, total: number) {
    return this.sendNotification({
      userId,
      type: NotificationType.ORDER_CONFIRMED,
      title: '✅ Commande confirmée !',
      body: `Votre commande de ${total} FCFA a été confirmée. Un livreur va être assigné.`,
      channel: NotificationChannel.PUSH,
      data: { orderId },
    });
  }

  async notifyDriverAssigned(userId: string, orderId: string) {
    return this.sendNotification({
      userId,
      type: NotificationType.DRIVER_ASSIGNED,
      title: '🛵 Livreur assigné !',
      body: 'Un livreur a été assigné à votre commande. Il est en route vers le dépôt.',
      channel: NotificationChannel.PUSH,
      data: { orderId },
    });
  }

  async notifyDriverEnRoute(userId: string, orderId: string, eta: number) {
    return this.sendNotification({
      userId,
      type: NotificationType.DRIVER_EN_ROUTE,
      title: '🔥 Votre gaz arrive !',
      body: `Votre livreur est en route. Arrivée estimée dans ${eta} minutes.`,
      channel: NotificationChannel.PUSH,
      data: { orderId, eta: eta.toString() },
    });
  }

  async notifyOrderDelivered(userId: string, orderId: string) {
    return this.sendNotification({
      userId,
      type: NotificationType.ORDER_DELIVERED,
      title: '🎉 Commande livrée !',
      body: 'Votre gaz a été livré. Merci de votre confiance !',
      channel: NotificationChannel.PUSH,
      data: { orderId },
    });
  }

  async getMyNotifications(userId: string) {
    return this.notificationsRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    await this.notificationsRepository.update(
      { id: notificationId, user: { id: userId } },
      { isRead: true },
    );
    return { message: 'Notification marquée comme lue' };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationsRepository.count({
      where: { user: { id: userId }, isRead: false },
    });
    return { count };
  }
}