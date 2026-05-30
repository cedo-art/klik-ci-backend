import {
  Entity, PrimaryGeneratedColumn, Column,
  UpdateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { Depot } from './depot.entity';
import { Product } from './product.entity';

@Entity('stocks')
export class Stock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Depot)
  @JoinColumn({ name: 'depot_id' })
  depot: Depot;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ default: 0 })
  quantity: number;

  @Column({ default: 5 })
  alertThreshold: number;

  @UpdateDateColumn()
  updatedAt: Date;
}