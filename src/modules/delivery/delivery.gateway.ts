import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/tracking',
})
export class DeliveryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connecté: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client déconnecté: ${client.id}`);
  }

  @SubscribeMessage('join-order')
  handleJoinOrder(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`order-${data.orderId}`);
    console.log(`Client ${client.id} rejoint la room order-${data.orderId}`);
    return { event: 'joined', data: { orderId: data.orderId } };
  }

  @SubscribeMessage('driver-location')
  handleDriverLocation(
    @MessageBody() data: { orderId: string; latitude: number; longitude: number; etaMinutes: number },
    @ConnectedSocket() client: Socket,
  ) {
    this.server.to(`order-${data.orderId}`).emit('location-update', {
      latitude: data.latitude,
      longitude: data.longitude,
      etaMinutes: data.etaMinutes,
      timestamp: new Date().toISOString(),
    });
  }

  emitLocationUpdate(orderId: string, data: any) {
    this.server.to(`order-${orderId}`).emit('location-update', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  emitDeliveryStatusUpdate(orderId: string, status: string) {
    this.server.to(`order-${orderId}`).emit('delivery-status', {
      status,
      timestamp: new Date().toISOString(),
    });
  }
}