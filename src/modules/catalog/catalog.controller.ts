import {
  Controller, Get, Post, Put, Patch, Delete, Body,
  Param, Query, UseGuards
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateDepotDto } from './dto/create-depot.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ─── PRODUITS ───
  @Get('products')
  getProducts() {
    return this.catalogService.getProducts();
  }

  @Post('products')
  @UseGuards(JwtAuthGuard)
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard)
  updateProduct(@Param('id') id: string, @Body() body: any) {
    return this.catalogService.updateProduct(id, body);
  }

  // ─── DÉPÔTS ───
  @Get('depots')
  getDepots(@Query('lat') lat: string, @Query('lng') lng: string) {
    if (lat && lng) {
      return this.catalogService.getDepotsNearby(
        parseFloat(lat),
        parseFloat(lng),
      );
    }
    return this.catalogService.getDepots();
  }

  @Post('depots')
  @UseGuards(JwtAuthGuard)
  createDepot(@Body() dto: CreateDepotDto) {
    return this.catalogService.createDepot(dto);
  }

  @Patch('depots/:id')
  @UseGuards(JwtAuthGuard)
  updateDepot(@Param('id') id: string, @Body() body: any) {
    return this.catalogService.updateDepot(id, body);
  }

  @Delete('depots/:id')
  @UseGuards(JwtAuthGuard)
  deleteDepot(@Param('id') id: string) {
    return this.catalogService.deleteDepot(id);
  }

  // ─── STOCKS ───
  @Get('depots/:id/stock')
  getDepotStock(@Param('id') id: string) {
    return this.catalogService.getDepotStock(id);
  }

  @Put('depots/:id/stock')
  @UseGuards(JwtAuthGuard)
  updateStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.catalogService.updateStock(id, dto);
  }

  @Get('geocode')
  geocodeAddress(@Query('address') address: string) {
    return this.catalogService.geocodeAddress(address);
  }
}