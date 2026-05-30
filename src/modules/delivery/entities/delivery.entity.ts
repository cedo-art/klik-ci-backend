import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToOne, JoinColumn
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

export enum DeliveryStatus {
  ASSIGNED = 'assigned',
  EN_ROUTE_DEPOT = 'en_route_depot',
  PICKED_UP = 'picked_up',
  EN_ROUTE_CLIENT = 'en_route_client',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'driver_id' })
  driver: User;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.ASSIGNED })
  status: DeliveryStatus;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  currentLat: number;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  currentLng: number;

  @Column({ nullable: true })
  etaMinutes: number;

  @Column({ nullable: true })
  assignedAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}