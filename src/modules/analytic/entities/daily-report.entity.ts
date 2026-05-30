import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { Depot } from '../../catalog/entities/depot.entity';

@Entity('daily_reports')
export class DailyReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Depot, { nullable: true })
  @JoinColumn({ name: 'depot_id' })
  depot: Depot;

  @Column({ type: 'date' })
  reportDate: string;

  @Column({ default: 0 })
  totalOrders: number;

  @Column({ default: 0 })
  deliveredOrders: number;

  @Column({ default: 0 })
  cancelledOrders: number;

  @Column({ default: 0 })
  totalRevenueFcfa: number;

  @Column({ default: 0 })
  totalDeliveryFeesFcfa: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  avgDeliveryMinutes: number;

  @Column('decimal', { precision: 3, scale: 2, default: 0 })
  avgRating: number;

  @CreateDateColumn()
  createdAt: Date;
}