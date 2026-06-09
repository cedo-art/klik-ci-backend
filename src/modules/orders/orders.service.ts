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

  // ─────────────────────────────────────────────────────────────────────────────
  // CRÉER UNE COMMANDE
  // Flux complet : validation stock → création commande → décrément stock →
  // broadcast aux livreurs de la zone
  // ─────────────────────────────────────────────────────────────────────────────
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

    // Sauvegarde des articles et décrément du stock
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

    // Broadcast aux livreurs : crée une livraison pour chaque livreur de la zone
    await this.broadcastToDrivers(savedOrder, depot);

    return this.ordersRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['depot', 'deliveryAddress', 'items', 'items.product'],
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BROADCAST AUX LIVREURS DE LA ZONE
  //
  // Logique :
  // 1. Vérifie que l'adresse client est dans le rayon du dépôt (5km par défaut)
  // 2. Trouve TOUS les livreurs actifs qui couvrent ce dépôt (depotIds ou commune)
  // 3. Crée une livraison "assigned" pour CHACUN d'eux
  // 4. Quand l'un accepte (→ en_route_depot), delivery.service.ts annule les autres
  // ─────────────────────────────────────────────────────────────────────────────
  private async broadcastToDrivers(order: Order, depot: Depot) {
    try {
      const depotLat = parseFloat(String(depot.latitude));
      const depotLng = parseFloat(String(depot.longitude));
      const rayonKm  = depot.deliveryRadiusKm || 5;

      // Vérification du rayon si l'adresse client a des coordonnées
      if (
        order.deliveryAddress?.latitude != null &&
        order.deliveryAddress?.longitude != null
      ) {
        const clientLat = parseFloat(String(order.deliveryAddress.latitude));
        const clientLng = parseFloat(String(order.deliveryAddress.longitude));

        if (!isNaN(clientLat) && !isNaN(clientLng)) {
          const distance = this.calculerDistance(depotLat, depotLng, clientLat, clientLng);
          if (distance > rayonKm) {
            console.log(`⚠️ Commande ${order.id} hors rayon : ${distance.toFixed(1)}km > ${rayonKm}km`);
            return;
          }
        }
      }

      // Trouver tous les livreurs actifs qui couvrent ce dépôt
      // Priorité 1 : livreurs avec ce dépôt dans leur depotIds
      // Priorité 2 : livreurs avec ce dépôt comme depotId principal
      // Priorité 3 : livreurs de la même commune (fallback)
      const drivers = await this.dataSource.query(`
        SELECT DISTINCT dr."userId"
        FROM drivers dr
        WHERE dr."isActive" = true
          AND (
            $1 = ANY(COALESCE(dr."depotIds", ARRAY[]::text[]))
            OR dr."depotId" = $1
            OR (
              dr."depotId" IS NULL
              AND (dr."depotIds" IS NULL OR array_length(dr."depotIds", 1) IS NULL)
              AND dr.zone = (SELECT commune FROM depots WHERE id = $1 LIMIT 1)
            )
          )
      `, [depot.id]);

      if (!drivers.length) {
        console.log(`⚠️ Aucun livreur pour le dépôt ${depot.id} (${depot.name})`);
        return;
      }

      console.log(`📡 Broadcast commande ${order.id} → ${drivers.length} livreur(s)`);

      // Créer une livraison par livreur
      for (const driverRow of drivers) {
        const driverUser = await this.usersRepository.findOne({
          where: { id: driverRow.userId },
        });
        if (!driverUser) continue;

        const delivery      = new Delivery();
        delivery.order      = order;
        delivery.driver     = driverUser;
        delivery.status     = DeliveryStatus.ASSIGNED;
        delivery.assignedAt = new Date();
        delivery.etaMinutes = 30;
        await this.deliveriesRepository.save(delivery);

        console.log(`✅ Livraison assignée au livreur ${driverRow.userId}`);
      }

      // Passer la commande en "preparing"
      order.status = OrderStatus.PREPARING;
      await this.ordersRepository.save(order);

    } catch (err) {
      console.log('❌ Broadcast error:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITAIRE : Calcul de distance Haversine entre deux points GPS (en km)
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN : TOUTES LES COMMANDES
  // ─────────────────────────────────────────────────────────────────────────────
  async getAllOrders() {
    return this.ordersRepository.find({
      relations: ['client', 'depot', 'deliveryAddress', 'items', 'items.product'],
      order: { createdAt: 'DESC' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLIENT : SES COMMANDES
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN : METTRE À JOUR LE STATUT D'UNE COMMANDE
  // ─────────────────────────────────────────────────────────────────────────────
  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Commande non trouvée');
    order.status = dto.status;
    return this.ordersRepository.save(order);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLIENT : ANNULER SA COMMANDE (uniquement si encore en attente)
  // ─────────────────────────────────────────────────────────────────────────────
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