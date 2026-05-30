import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Depot } from './entities/depot.entity';
import { Stock } from './entities/stock.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateDepotDto } from './dto/create-depot.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { MapsProvider } from './providers/maps.provider';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Depot)
    private depotsRepository: Repository<Depot>,
    @InjectRepository(Stock)
    private stocksRepository: Repository<Stock>,
    private mapsProvider: MapsProvider,
  ) {}

  async getProducts() {
    return this.productsRepository.find({
      where: { isActive: true },
      order: { weightKg: 'ASC' },
    });
  }

  async createProduct(dto: CreateProductDto) {
    const product = this.productsRepository.create(dto);
    return this.productsRepository.save(product);
  }

  async updateProduct(id: string, data: Partial<Product>) {
    await this.productsRepository.update(id, data);
    return this.productsRepository.findOne({ where: { id } });
  }

  async getDepots() {
    return this.depotsRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async getDepotsNearby(lat: number, lng: number) {
    const depots = await this.depotsRepository.find({
      where: { isActive: true },
    });
    return this.mapsProvider.getNearbyDepots(lat, lng, depots);
  }

  async geocodeAddress(address: string) {
    return this.mapsProvider.geocodeAddress(address);
  }

  async createDepot(dto: CreateDepotDto) {
    const depot = this.depotsRepository.create(dto);
    return this.depotsRepository.save(depot);
  }

  async updateDepot(id: string, data: any) {
    await this.depotsRepository.update(id, data);
    return this.depotsRepository.findOne({ where: { id } });
  }

  async deleteDepot(id: string) {
    // Désactiver la station
    await this.depotsRepository.update(id, { isActive: false });
    return { success: true, message: 'Station désactivée avec succès' };
  }

  async getDepotStock(depotId: string) {
    const depot = await this.depotsRepository.findOne({
      where: { id: depotId },
    });
    if (!depot) throw new NotFoundException('Dépôt non trouvé');
    return this.stocksRepository.find({
      where: { depot: { id: depotId } },
      relations: ['product'],
      order: { product: { weightKg: 'ASC' } },
    });
  }

  async updateStock(depotId: string, dto: UpdateStockDto) {
    let stock = await this.stocksRepository.findOne({
      where: {
        depot: { id: depotId },
        product: { id: dto.productId },
      },
    });
    if (!stock) {
      stock = this.stocksRepository.create({
        depot: { id: depotId } as any,
        product: { id: dto.productId } as any,
        quantity: dto.quantity,
        alertThreshold: dto.alertThreshold || 5,
      });
    } else {
      stock.quantity = dto.quantity;
      if (dto.alertThreshold) stock.alertThreshold = dto.alertThreshold;
    }
    return this.stocksRepository.save(stock);
  }
}