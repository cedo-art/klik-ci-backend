import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Delivery, DeliveryStatus } from './entities/delivery.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { DeliveryGateway } from './delivery.gateway';
import { SmsProvider } from '../notifications/providers/sms.provider';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(Delivery)
    private deliveriesRepository: Repository<Delivery>,
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectDataSource() private dataSource: DataSource,
    private deliveryGateway: DeliveryGateway,
    private smsProvider: SmsProvider,
  ) {}

  async getDriverProfile(userId: string) {
    const rows = await this.dataSource.query(`
      SELECT
        dr.id, dr."fullName", dr.phone, dr.zone,
        dr."licenseNumber", dr."photoUrl", dr."isActive", dr."userId",
        d.id   AS "depotId",   d.name AS "depotNom",
        d."logoUrl" AS "depotLogo",
        d.latitude AS "depotLat", d.longitude AS "depotLng",
        d.address  AS "depotAdresse",
        t."plateNumber" AS "tricyclePlate"
      FROM drivers dr
      LEFT JOIN depots    d ON d.id = dr."depotId"
      LEFT JOIN tricycles t ON t."driverId" = dr.id
      WHERE dr."userId" = $1 AND dr."isActive" = true
      LIMIT 1
    `, [userId]);
    if (!rows.length) throw new NotFoundException('Profil livreur non trouvé');
    return rows[0];
  }

 async getDriverZoneStations(userId: string) {
  const driver = await this.dataSource.query(
    `SELECT dr.zone FROM drivers dr WHERE dr."userId" = $1 LIMIT 1`,
    [userId]
  );
  if (!driver.length) return [];
  const zone = driver[0].zone;
  if (!zone) return [];

  return this.dataSource.query(`
    SELECT
      d.id, d.name, d.address, d.latitude, d.longitude,
      d."logoUrl", d."isActive", d.commune,
      COALESCE(SUM(s.quantity), 0)::int AS stock
    FROM depots d
    LEFT JOIN stocks s ON s.depot_id = d.id
    WHERE d."isActive" = true
      AND LOWER(TRIM(d.commune)) = LOWER(TRIM($1))
    GROUP BY d.id
    ORDER BY d.name
  `, [zone]);
}

  async getDeliveryByOrder(orderId: string) {
    const delivery = await this.deliveriesRepository.findOne({
      where: { order: { id: orderId } },
      relations: ['driver', 'order', 'order.depot', 'order.deliveryAddress'],
    });
    if (!delivery) throw new NotFoundException('Livraison non trouvée');

    const driverInfo = await this.dataSource.query(`
      SELECT dr."fullName", dr.phone, dr.zone,
             t."plateNumber" AS "tricyclePlate"
      FROM drivers dr
      LEFT JOIN tricycles t ON t."driverId" = dr.id
      WHERE dr."userId" = $1
      LIMIT 1
    `, [delivery.driver?.id]);

    return {
      ...delivery,
      driver: {
        ...delivery.driver,
        fullName:      driverInfo[0]?.fullName      || delivery.driver?.phone,
        tricyclePlate: driverInfo[0]?.tricyclePlate || '—',
        zone:          driverInfo[0]?.zone          || '',
      },
    };
  }

  async getMyDeliveries(userId: string) {
    return this.deliveriesRepository.find({
      where: { driver: { id: userId } },
      relations: [
        'order', 'order.depot', 'order.deliveryAddress',
        'order.client', 'order.items', 'order.items.product',
      ],
      order: { assignedAt: 'DESC' },
    });
  }

  async assignDriver(orderId: string, dto: AssignDriverDto) {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId }, relations: ['client'],
    });
    if (!order) throw new NotFoundException('Commande non trouvée');
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException('La commande doit être confirmée avant d\'assigner un livreur');
    }
    const driver = await this.usersRepository.findOne({ where: { id: dto.driverId } });
    if (!driver) throw new NotFoundException('Livreur non trouvé');

    const delivery      = new Delivery();
    delivery.order      = order;
    delivery.driver     = driver;
    delivery.status     = DeliveryStatus.ASSIGNED;
    delivery.assignedAt = new Date();
    const saved = await this.deliveriesRepository.save(delivery);

    order.status = OrderStatus.PREPARING;
    await this.ordersRepository.save(order);

    if (order.client?.phone) {
      await this.smsProvider.sendSms(
        order.client.phone,
        `Klik CI - Votre commande est confirmée ! Votre bouteille vous sera livrée bientôt.`
      ).catch(() => {});
    }

    this.deliveryGateway.emitDeliveryStatusUpdate(orderId, DeliveryStatus.ASSIGNED);
    return saved;
  }

  async updateLocation(deliveryId: string, dto: UpdateLocationDto) {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id: deliveryId }, relations: ['order', 'order.client'],
    });
    if (!delivery) throw new NotFoundException('Livraison non trouvée');

    delivery.currentLat = dto.latitude;
    delivery.currentLng = dto.longitude;
    if (dto.etaMinutes !== undefined) delivery.etaMinutes = dto.etaMinutes;

    const saved = await this.deliveriesRepository.save(delivery);
    this.deliveryGateway.emitLocationUpdate(delivery.order.id, {
      latitude: dto.latitude, longitude: dto.longitude, etaMinutes: dto.etaMinutes,
    });

    if (dto.etaMinutes && dto.etaMinutes <= 5 && delivery.order.client?.phone) {
      await this.smsProvider.sendSms(
        delivery.order.client.phone,
        `Klik CI - Votre livreur arrive dans ${dto.etaMinutes} min !`
      ).catch(() => {});
    }
    return saved;
  }

  async updateStatus(deliveryId: string, dto: UpdateDeliveryStatusDto) {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id: deliveryId },
      relations: ['order', 'order.client', 'order.items', 'order.items.product'],
    });
    if (!delivery) throw new NotFoundException('Livraison non trouvée');

    delivery.status = dto.status;

    if (dto.status === DeliveryStatus.DELIVERED) {
      delivery.deliveredAt  = new Date();
      delivery.order.status = OrderStatus.DELIVERED;
      await this.ordersRepository.save(delivery.order);

      if (delivery.order.client?.phone) {
        const produit = delivery.order.items?.[0]?.product?.name || 'Bouteille de gaz';
        await this.smsProvider.sendSms(
          delivery.order.client.phone,
          `Klik CI - Votre bouteille ${produit} a été livrée avec succès ! Merci de votre confiance 🙏`
        ).catch(() => {});
      }
    }

    if (dto.status === DeliveryStatus.EN_ROUTE_CLIENT) {
      delivery.order.status = OrderStatus.PICKED_UP;
      await this.ordersRepository.save(delivery.order);

      if (delivery.order.client?.phone) {
        await this.smsProvider.sendSms(
          delivery.order.client.phone,
          `Klik CI - Votre livreur Klik est en route ! Arrivée estimée : ${delivery.etaMinutes || 30} min.`
        ).catch(() => {});
      }
    }

    if (dto.status === DeliveryStatus.PICKED_UP) {
      delivery.order.status = OrderStatus.PREPARING;
      await this.ordersRepository.save(delivery.order);
    }

    const saved = await this.deliveriesRepository.save(delivery);
    this.deliveryGateway.emitDeliveryStatusUpdate(delivery.order.id, dto.status);
    return saved;
  }

  async autoAssignDriver(orderId: string) {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId }, relations: ['depot'],
    });
    if (!order) return;

    const drivers = await this.dataSource.query(`
      SELECT dr."userId" FROM drivers dr
      JOIN depots d ON d.id = dr."depotId"
      WHERE dr."isActive" = true AND d.id = $1
      LIMIT 1
    `, [order.depot?.id]);
    if (!drivers.length) return;

    const driverUser = await this.usersRepository.findOne({ where: { id: drivers[0].userId } });
    if (!driverUser) return;

    const delivery      = new Delivery();
    delivery.order      = order;
    delivery.driver     = driverUser;
    delivery.status     = DeliveryStatus.ASSIGNED;
    delivery.assignedAt = new Date();
    delivery.etaMinutes = 30;
    await this.deliveriesRepository.save(delivery);

    order.status = OrderStatus.PREPARING;
    await this.ordersRepository.save(order);
  }
}