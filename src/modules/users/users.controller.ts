import {
  Controller, Get, Post, Delete,
  Body, Param, UseGuards, Request
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  getProfile(@Request() req) {
    return this.usersService.getProfile(req.user.id);
  }

  @Get('clients')
  getClients() {
    return this.usersService.getClients();
  }

  @Get('addresses')
  getAddresses(@Request() req) {
    return this.usersService.getAddresses(req.user.id);
  }

  @Post('addresses')
  createAddress(@Request() req, @Body() dto: CreateAddressDto) {
    return this.usersService.createAddress(req.user.id, dto);
  }

  @Delete('addresses/:id')
  deleteAddress(@Request() req, @Param('id') id: string) {
    return this.usersService.deleteAddress(req.user.id, id);
  }
}