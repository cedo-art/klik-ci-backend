import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Depot } from '../../catalog/entities/depot.entity';
import { Address } from '../../users/entities/address.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING    = 'pending',
  CONFIRMED  = 'confirmed',
  PREPARING  = 'preparing',
  PICKED_UP  = 'picked_up',
  DELIVERED  = 'delivered',
  CANCELLED  = 'cancelled',
}

export enum OrderType {
  STANDARD  = 'standard',
  RAPIDE    = 'rapide',
  EXPRESS   = 'express',
  SCHEDULED = 'scheduled',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'client_id' })
  client: User;

  @ManyToOne(() => Depot)
  @JoinColumn({ name: 'depot_id' })
  depot: Depot;

  @ManyToOne(() => Address)
  @JoinColumn({ name: 'delivery_address_id' })
  deliveryAddress: Address;

  @OneToMany(() => OrderItem, item => item.order)
  items: OrderItem[];

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'enum', enum: OrderType, default: OrderType.RAPIDE })
  type: OrderType;

  @Column()
  totalFcfa: number;

  @Column({ default: 0 })
  deliveryFeeFcfa: number;

  @Column({ nullable: true })
  scheduledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}