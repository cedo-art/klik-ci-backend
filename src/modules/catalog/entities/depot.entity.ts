import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('depots')
export class Depot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'manager_id' })
  manager: User;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column('decimal', { precision: 10, scale: 7 })
  latitude: number;

  @Column('decimal', { precision: 10, scale: 7 })
  longitude: number;

  @Column({ nullable: true })
  commune: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ default: 5 })
  deliveryRadiusKm: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'time', nullable: true })
  opensAt: string;

  @Column({ type: 'time', nullable: true })
  closesAt: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}