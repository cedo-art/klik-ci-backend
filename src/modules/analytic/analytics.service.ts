import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Delivery } from '../delivery/entities/delivery.entity';
import { Transaction, PaymentStatus } from '../payments/entities/transaction.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Delivery)
    private deliveriesRepository: Repository<Delivery>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      deliveredOrders,
      pendingOrders,
      cancelledOrders,
      totalClients,
      totalDrivers,
      totalRevenue,
    ] = await Promise.all([
      this.ordersRepository.count(),
      this.ordersRepository.count({ where: { createdAt: MoreThanOrEqual(today) } }),
      this.ordersRepository.count({ where: { status: OrderStatus.DELIVERED } }),
      this.ordersRepository.count({ where: { status: OrderStatus.PENDING } }),
      this.ordersRepository.count({ where: { status: OrderStatus.CANCELLED } }),
      this.usersRepository.count({ where: { role: UserRole.CLIENT } }),
      this.usersRepository.count({ where: { role: UserRole.DRIVER } }),
      this.transactionsRepository
        .createQueryBuilder('t')
        .select('SUM(t.amountFcfa)', 'total')
        .where('t.status = :status', { status: PaymentStatus.SUCCESS })
        .getRawOne(),
    ]);

    const deliveryRate = totalOrders > 0
      ? Math.round((deliveredOrders / totalOrders) * 100)
      : 0;

    return {
      orders: {
        total: totalOrders,
        today: todayOrders,
        delivered: deliveredOrders,
        pending: pendingOrders,
        cancelled: cancelledOrders,
        deliveryRate: `${deliveryRate}%`,
      },
      users: {
        totalClients,
        totalDrivers,
      },
      revenue: {
        total: parseInt(totalRevenue?.total || '0'),
        currency: 'FCFA',
      },
    };
  }

  async getRecentOrders(limit = 10) {
    return this.ordersRepository.find({
      relations: ['client', 'depot', 'deliveryAddress'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getRecentUsers(limit = 10) {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getOrdersByStatus() {
    return this.ordersRepository
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('order.status')
      .getRawMany();
  }

  async getRevenueByDay(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.transactionsRepository
      .createQueryBuilder('t')
      .select("DATE_TRUNC('day', t.createdAt)", 'date')
      .addSelect('SUM(t.amountFcfa)', 'revenue')
      .where('t.status = :status', { status: PaymentStatus.SUCCESS })
      .andWhere('t.createdAt >= :startDate', { startDate })
      .groupBy("DATE_TRUNC('day', t.createdAt)")
      .orderBy("DATE_TRUNC('day', t.createdAt)", 'ASC')
      .getRawMany();
  }

  async getAllUsers() {
    return this.usersRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async toggleUserStatus(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return { message: 'Utilisateur non trouvé' };
    user.isActive = !user.isActive;
    await this.usersRepository.save(user);
    return { message: `Utilisateur ${user.isActive ? 'activé' : 'désactivé'}`, isActive: user.isActive };
  }
}