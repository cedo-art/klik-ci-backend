import {
  Controller, Get, Post, Patch,
  Body, Param, UseGuards, Request
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('delivery')
@UseGuards(JwtAuthGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('me')
  getDriverProfile(@Request() req) {
    return this.deliveryService.getDriverProfile(req.user.id);
  }

  @Get('my-zone-stations')
  getDriverZoneStations(@Request() req) {
    return this.deliveryService.getDriverZoneStations(req.user.id);
  }

  @Get('my-deliveries')
  getMyDeliveries(@Request() req) {
    return this.deliveryService.getMyDeliveries(req.user.id);
  }

  @Get('order/:orderId')
  getDeliveryByOrder(@Param('orderId') orderId: string) {
    return this.deliveryService.getDeliveryByOrder(orderId);
  }

  @Post(':orderId/assign')
  assignDriver(@Param('orderId') orderId: string, @Body() dto: AssignDriverDto) {
    return this.deliveryService.assignDriver(orderId, dto);
  }

  @Patch(':id/location')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.deliveryService.updateLocation(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateDeliveryStatusDto) {
    return this.deliveryService.updateStatus(id, dto);
  }
}