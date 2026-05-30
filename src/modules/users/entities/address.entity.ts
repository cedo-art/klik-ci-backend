import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn
} from 'typeorm';
import { User } from './user.entity';

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  label: string;

  @Column()
  fullAddress: string;

 @Column('decimal', { precision: 10, scale: 7, nullable: true })
latitude: number;

@Column('decimal', { precision: 10, scale: 7, nullable: true })
longitude: number;

  @Column({ nullable: true })
  quartier: string;

  @Column({ nullable: true })
  commune: string;

  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;
}