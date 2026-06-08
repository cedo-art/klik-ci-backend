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
    order.client          = { id: userId } as any;
    order.depot           = depot;
    if (address) order.deliveryAddress = address;
    order.type            = dto.type;
    order.totalFcfa       = totalFcfa;
    order.deliveryFeeFcfa = deliveryFeeFcfa;
    order.status          = OrderStatus.CONFIRMED;
    if (dto.scheduledAt) order.scheduledAt = new Date(dto.scheduledAt);

    const savedOrder = await this.ordersRepository.save(order);

    for (const item of orderItems) {
      const orderItem         = new OrderItem();
      orderItem.order         = savedOrder;
      orderItem.product       = item.product;
      orderItem.quantity      = item.quantity;
      orderItem.unitPriceFcfa = item.unitPriceFcfa;
      orderItem.returnEmpty   = item.returnEmpty;
      await this.orderItemsRepository.save(orderItem);

      const stock = await this.stocksRepository.findOne({
        where: { depot: { id: dto.depotId }, product: { id: item.product.id } },
      });
      if (stock) {
        stock.quantity -= item.quantity;
        await this.stocksRepository.save(stock);
      }
    }

    // ── Auto-assignation par rayon ────────────────────────────────────────
    await this.autoAssignDriver(savedOrder, depot.id);

    return this.ordersRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['depot', 'deliveryAddress', 'items', 'items.product'],
    });
  }

  // ── Calcul distance Haversine en km ──────────────────────────────────────
  private calculerDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Auto-assignation : rayon station → livreur de la station ─────────────
  private async autoAssignDriver(order: Order, depotId: string) {
    try {
      // 1. Coordonnées et rayon du dépôt
      const depots = await this.dataSource.query(`
        SELECT latitude, longitude, "deliveryRadiusKm"
        FROM depots WHERE id = $1
      `, [depotId]);
      if (!depots.length) return;

      const depotLat = parseFloat(depots[0].latitude);
      const depotLng = parseFloat(depots[0].longitude);
      const rayonKm  = parseFloat(depots[0].deliveryRadiusKm) || 5;

      // 2. Vérifier que l'adresse client est dans le rayon
      if (
        order.deliveryAddress?.latitude != null &&
        order.deliveryAddress?.longitude != null
      ) {
        const clientLat = parseFloat(String(order.deliveryAddress.latitude));
        const clientLng = parseFloat(String(order.deliveryAddress.longitude));

        if (!isNaN(clientLat) && !isNaN(clientLng)) {
          const distance = this.calculerDistance(depotLat, depotLng, clientLat, clientLng);
          if (distance > rayonKm) {
            console.log(
              `Commande ${order.id} hors rayon : ${distance.toFixed(1)}km > ${rayonKm}km`
            );
            return;
          }
        }
      }
      // Si deliveryAddress est null ou sans coordonnées, on assigne quand même
      // (le client n'a pas encore confirmé l'adresse — on laisse le livreur gérer)

      // 3. Livreur actif assigné à ce dépôt exact (ordre aléatoire pour équilibrer)
      const drivers = await this.dataSource.query(`
        SELECT dr."userId"
        FROM drivers dr
        WHERE dr."depotId" = $1
          AND dr."isActive" = true
        ORDER BY RANDOM()
        LIMIT 1
      `, [depotId]);

      let driverUserId: string | null = null;

      if (drivers.length > 0) {
        driverUserId = drivers[0].userId;
      } else {
        // 4. Fallback : livreur actif dans la même commune
        const fallback = await this.dataSource.query(`
          SELECT dr."userId"
          FROM drivers dr
          JOIN depots d ON d.id = dr."depotId"
          WHERE dr."isActive" = true
            AND LOWER(TRIM(d.commune)) = LOWER(TRIM(
              (SELECT commune FROM depots WHERE id = $1)
            ))
          ORDER BY RANDOM()
          LIMIT 1
        `, [depotId]);

        if (fallback.length > 0) driverUserId = fallback[0].userId;
      }

      if (!driverUserId) {
        console.log(`Aucun livreur disponible pour le dépôt ${depotId}`);
        return;
      }

      const driverUser = await this.usersRepository.findOne({
        where: { id: driverUserId },
      });
      if (!driverUser) return;

      // 5. Créer la livraison
      const delivery      = new Delivery();
      delivery.order      = order;
      delivery.driver     = driverUser;
      delivery.status     = DeliveryStatus.ASSIGNED;
      delivery.assignedAt = new Date();
      delivery.etaMinutes = 30;
      await this.deliveriesRepository.save(delivery);

      order.status = OrderStatus.PREPARING;
      await this.ordersRepository.save(order);

      console.log(`✅ Commande ${order.id} assignée au livreur ${driverUserId}`);
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