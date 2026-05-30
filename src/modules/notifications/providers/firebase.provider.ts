import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class FirebaseProvider implements OnModuleInit {
  private isInitialized = false;

  onModuleInit() {
    if (!process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID === 'gazexpress-ci') {
      console.log('Firebase non configuré — mode développement');
      return;
    }

    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          }),
        });
        this.isInitialized = true;
      }
    } catch (error) {
      console.error('Firebase init error:', error.message);
    }
  }

  async sendPushNotification(params: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }) {
    if (!this.isInitialized) {
      console.log(`[DEV] Push notification: ${params.title} - ${params.body}`);
      return { success: true, dev: true };
    }

    try {
      const admin = require('firebase-admin');
      const response = await admin.messaging().send({
        token: params.token,
        notification: { title: params.title, body: params.body },
        data: params.data || {},
      });
      return { success: true, messageId: response };
    } catch (error) {
      console.error('Firebase push error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendMulticastNotification(params: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }) {
    if (!this.isInitialized) {
      console.log(`[DEV] Multicast notification: ${params.title} - ${params.body}`);
      return { success: true, dev: true };
    }

    try {
      const admin = require('firebase-admin');
      const response = await admin.messaging().sendEachForMulticast({
        tokens: params.tokens,
        notification: { title: params.title, body: params.body },
        data: params.data || {},
      });
      return { success: true, successCount: response.successCount, failureCount: response.failureCount };
    } catch (error) {
      console.error('Firebase multicast error:', error.message);
      return { success: false, error: error.message };
    }
  }
}