import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../catalog/entities/product.entity';
import { Depot } from '../catalog/entities/depot.entity';
import { Stock } from '../catalog/entities/stock.entity';
import { Address } from '../users/entities/address.entity';
import { Delivery, DeliveryStatus } from '../delivery/entities/delivery.entity';
import { User } from '../users/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

interface OrderItemTemp {
  product: Product;
  quantity: number;
  unitPriceFcfa: number;
  returnEmpty: boolean;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Depot)
    private depotsRepository: Repository<Depot>,
    @InjectRepository(Stock)
    private stocksRepository: Repository<Stock>,
    @InjectRepository(Address)
    private addressesRepository: Repository<Address>,
    @InjectRepository(Delivery)
    private deliveriesRepository: Repository<Delivery>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const depot = await this.depotsRepository.findOne({
      where: { id: dto.depotId, isActive: true },
    });
    if (!depot) throw new NotFoundException('Dépôt non trouvé ou inactif');

    let address: Address | null = null;
    if (dto.deliveryAddressId) {
      address = await this.addressesRepository.findOne({
        where: { id: dto.deliveryAddressId },
      });
    }

    let totalFcfa = 0;
    const orderItems: OrderItemTemp[] = [];

    for (const item of dto.items) {
      const product = await this.productsRepository.findOne({
        where: { id: item.productId, isActive: true },
      });
      if (!product) throw new NotFoundException(`Produit ${item.productId} non trouvé`);

      const stock = await this.stocksRepository.findOne({
        where: { depot: { id: dto.depotId }, product: { id: item.productId } },
      });
      if (!stock || stock.quantity < item.quantity) {
        throw new BadRequestException(`Stock insuffisant pour ${product.name}`);
      }

      totalFcfa += product.priceFcfa * item.quantity;
      orderItems.push({
        product,
        quantity: item.quantity,
        unitPriceFcfa: product.priceFcfa,
        returnEmpty: item.returnEmpty || false,
      });
    }

    const deliveryFeeFcfa = 500;
    totalFcfa += deliveryFeeFcfa;

    const order = new Order();
    order.client    = { id: userId } as any;
    order.depot     = depot;
    if (address) order.deliveryAddress = address;
    order.type           = dto.type;
    order.totalFcfa      = totalFcfa;
    order.deliveryFeeFcfa = deliveryFeeFcfa;
    order.status         = OrderStatus.CONFIRMED;
    if (dto.scheduledAt) order.scheduledAt = new Date(dto.scheduledAt);

    const savedOrder = await this.ordersRepository.save(order);

    for (const item of orderItems) {
      const orderItem       = new OrderItem();
      orderItem.order       = savedOrder;
      orderItem.product     = item.product;
      orderItem.quantity    = item.quantity;
      orderItem.unitPriceFcfa = item.unitPriceFcfa;
      orderItem.returnEmpty = item.returnEmpty;
      await this.orderItemsRepository.save(orderItem);

      const stock = await this.stocksRepository.findOne({
        where: { depot: { id: dto.depotId }, product: { id: item.product.id } },
      });
      if (stock) {
        stock.quantity -= item.quantity;
        await this.stocksRepository.save(stock);
      }
    }

    // ── Auto-assignation via table drivers ───────────────────────────────
    await this.autoAssignDriver(savedOrder, depot.id);

    return this.ordersRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['depot', 'deliveryAddress', 'items', 'items.product'],
    });
  }

  // ── Cherche un livreur actif assigné au dépôt de la commande ────────────
  private async autoAssignDriver(order: Order, depotId: string) {
    try {
      // 1. Chercher un livreur dans drivers dont le depotId correspond
      const drivers = await this.dataSource.query(`
        SELECT dr."userId"
        FROM drivers dr
        WHERE dr."depotId" = $1
          AND dr."isActive" = true
        LIMIT 1
      `, [depotId]);

      // 2. Si pas trouvé par dépôt exact, chercher dans la même commune
      let driverUserId: string | null = null;

      if (drivers.length > 0) {
        driverUserId = drivers[0].userId;
      } else {
        // Fallback : chercher n'importe quel livreur actif
        const anyDriver = await this.dataSource.query(`
          SELECT "userId" FROM drivers
          WHERE "isActive" = true
          LIMIT 1
        `);
        if (anyDriver.length > 0) driverUserId = anyDriver[0].userId;
      }

      if (!driverUserId) return; // Aucun livreur disponible

      const driverUser = await this.usersRepository.findOne({
        where: { id: driverUserId },
      });
      if (!driverUser) return;

      const delivery         = new Delivery();
      delivery.order         = order;
      delivery.driver        = driverUser;
      delivery.status        = DeliveryStatus.ASSIGNED;
      delivery.assignedAt    = new Date();
      delivery.etaMinutes    = 30;
      await this.deliveriesRepository.save(delivery);

      order.status = OrderStatus.PREPARING;
      await this.ordersRepository.save(order);

    } catch (err) {
      console.log('Auto-assign error:', err);
    }
  }

  // ── ADMIN : toutes les commandes ─────────────────────────────────────────
  async getAllOrders() {
    return this.ordersRepository.find({
      relations: ['client', 'depot', 'deliveryAddress', 'items', 'items.product'],
      order: { createdAt: 'DESC' },
    });
  }

  async getMyOrders(userId: string) {
    return this.ordersRepository.find({
      where: { client: { id: userId } },
      relations: ['depot', 'deliveryAddress', 'items', 'items.product'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOrderById(orderId: string, userId: string) {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId, client: { id: userId } },
      relations: ['depot', 'deliveryAddress', 'items', 'items.product'],
    });
    if (!order) throw new NotFoundException('Commande non trouvée');
    return order;
  }

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Commande non trouvée');
    order.status = dto.status;
    return this.ordersRepository.save(order);
  }

  async cancelOrder(orderId: string, userId: string) {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId, client: { id: userId } },
    });
    if (!order) throw new NotFoundException('Commande non trouvée');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Seules les commandes en attente peuvent être annulées');
    }
    order.status = OrderStatus.CANCELLED;
    return this.ordersRepository.save(order);
  }
}