import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EventType {
  ORDER_CREATED = 'order_created',
  ORDER_CANCELLED = 'order_cancelled',
  ORDER_DELIVERED = 'order_delivered',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  USER_REGISTERED = 'user_registered',
  DRIVER_ASSIGNED = 'driver_assigned',
  APP_OPENED = 'app_opened',
  SEARCH_PERFORMED = 'search_performed',
}

@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: EventType })
  type: EventType;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  depotId: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  deviceType: string;

  @CreateDateColumn()
  createdAt: Date;
}