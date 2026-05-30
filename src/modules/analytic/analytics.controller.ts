import {
  Controller, Get, Patch,
  Param, Query, UseGuards
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboardStats() {
    return this.analyticsService.getDashboardStats();
  }

  @Get('orders/recent')
  getRecentOrders(@Query('limit') limit: string) {
    return this.analyticsService.getRecentOrders(limit ? parseInt(limit) : 10);
  }

  @Get('orders/by-status')
  getOrdersByStatus() {
    return this.analyticsService.getOrdersByStatus();
  }

  @Get('revenue/by-day')
  getRevenueByDay(@Query('days') days: string) {
    return this.analyticsService.getRevenueByDay(days ? parseInt(days) : 7);
  }

  @Get('users')
  getAllUsers() {
    return this.analyticsService.getAllUsers();
  }

  @Get('users/recent')
  getRecentUsers(@Query('limit') limit: string) {
    return this.analyticsService.getRecentUsers(limit ? parseInt(limit) : 10);
  }

  @Patch('users/:id/toggle-status')
  toggleUserStatus(@Param('id') id: string) {
    return this.analyticsService.toggleUserStatus(id);
  }
}