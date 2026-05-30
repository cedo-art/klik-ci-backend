import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { FirebaseProvider } from './providers/firebase.provider';
import { SmsProvider } from './providers/sms.provider';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebaseProvider, SmsProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}