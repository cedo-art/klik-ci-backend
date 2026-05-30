import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { MapsProvider } from './providers/maps.provider';
import { Product } from './entities/product.entity';
import { Depot } from './entities/depot.entity';
import { Stock } from './entities/stock.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Depot, Stock]),
    AuthModule,
  ],
  controllers: [CatalogController],
  providers: [CatalogService, MapsProvider],
  exports: [CatalogService, MapsProvider],
})
export class CatalogModule {}