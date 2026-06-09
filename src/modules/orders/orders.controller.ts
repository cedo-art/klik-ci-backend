import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Request
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Client : créer une commande (broadcast automatique aux livreurs)
  @Post()
  createOrder(@Request() req, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(req.user.id, dto);
  }

  // Admin : toutes les commandes
  @Get('admin/all')
  getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  // Client : ses commandes
  @Get()
  getMyOrders(@Request() req) {
    return this.ordersService.getMyOrders(req.user.id);
  }

  // Admin : broadcaster une commande existante aux livreurs de sa zone
  // Appelé depuis le back-office quand on clique "Préparer"
  @Post(':id/broadcast')
  broadcastOrder(@Param('id') id: string) {
    return this.ordersService.broadcastExistingOrder(id);
  }

  @Get(':id')
  getOrderById(@Request() req, @Param('id') id: string) {
    return this.ordersService.getOrderById(id, req.user.id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateOrderStatus(id, dto);
  }

  @Delete(':id')
  cancelOrder(@Request() req, @Param('id') id: string) {
    return this.ordersService.cancelOrder(id, req.user.id);
  }
}