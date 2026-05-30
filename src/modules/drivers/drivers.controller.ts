import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  getAll() {
    return this.driversService.getAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.driversService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.driversService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.driversService.delete(id);
  }

  // ── Tricycles ─────────────────────────────────────────────────────────────
  @Get('tricycles')
  getTricycles() {
    return this.driversService.getTricycles();
  }

  @Post('tricycles')
  createTricycle(@Body() body: any) {
    return this.driversService.createTricycle(body);
  }

  @Patch('tricycles/:id')
  updateTricycle(@Param('id') id: string, @Body() body: any) {
    return this.driversService.updateTricycle(id, body);
  }

  @Delete('tricycles/:id')
  deleteTricycle(@Param('id') id: string) {
    return this.driversService.deleteTricycle(id);
  }
}