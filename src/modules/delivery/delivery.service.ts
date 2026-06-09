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

  // ─────────────────────────────────────────────────────────────────────────────
  // PROFIL LIVREUR
  // Retourne le profil métier du livreur connecté (station principale, tricycle, etc.)
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // STATIONS DE LA ZONE DU LIVREUR
  // Priorité : stations explicitement assignées (depotIds) > toutes les stations
  // de la commune du livreur (fallback)
  // ─────────────────────────────────────────────────────────────────────────────
  async getDriverZoneStations(userId: string) {
    const driver = await this.dataSource.query(
      `SELECT zone, "depotIds" FROM drivers WHERE "userId" = $1 LIMIT 1`,
      [userId]
    );
    if (!driver.length) return [];
    const { zone, depotIds } = driver[0];

    // Stations explicitement assignées au livreur
    if (depotIds && depotIds.length > 0) {
      return this.dataSource.query(`
        SELECT
          d.id, d.name, d.address, d.latitude, d.longitude,
          d."logoUrl", d."isActive", d.commune,
          COALESCE(SUM(s.quantity), 0)::int AS stock
        FROM depots d
        LEFT JOIN stocks s ON s.depot_id = d.id
        WHERE d."isActive" = true AND d.id = ANY($1)
        GROUP BY d.id
        ORDER BY d.name
      `, [depotIds]);
    }

    // Fallback : toutes les stations actives de la commune du livreur
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

  // ─────────────────────────────────────────────────────────────────────────────
  // DÉTAIL D'UNE LIVRAISON PAR COMMANDE
  // Enrichit la réponse avec les infos du driver depuis la table drivers
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // MES LIVRAISONS
  // Retourne toutes les livraisons du livreur connecté (actives + historique)
  // Filtre côté app par statut pour n'afficher que les actives
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // ASSIGNER UN LIVREUR MANUELLEMENT (depuis le back-office)
  // ─────────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────────
  // MISE À JOUR DE LA POSITION GPS DU LIVREUR
  // Appelé toutes les 5s par l'app livreur pendant une course active
  // Émet un événement WebSocket pour que le client suive en temps réel
  // ─────────────────────────────────────────────────────────────────────────────
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

    // SMS automatique quand le livreur est à moins de 5 minutes
    if (dto.etaMinutes && dto.etaMinutes <= 5 && delivery.order.client?.phone) {
      await this.smsProvider.sendSms(
        delivery.order.client.phone,
        `Klik CI - Votre livreur arrive dans ${dto.etaMinutes} min !`
      ).catch(() => {});
    }
    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MISE À JOUR DU STATUT D'UNE LIVRAISON
  //
  // Logique d'acceptation exclusive (broadcast) :
  // Quand un livreur passe en "en_route_depot" (accepte la course), on annule
  // toutes les autres copies de la même commande chez les autres livreurs.
  // Ainsi la commande disparaît automatiquement de leurs écrans.
  // ─────────────────────────────────────────────────────────────────────────────
  async updateStatus(deliveryId: string, dto: UpdateDeliveryStatusDto) {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id: deliveryId },
      relations: ['order', 'order.client', 'order.items', 'order.items.product'],
    });
    if (!delivery) throw new NotFoundException('Livraison non trouvée');

    // ── ACCEPTATION EXCLUSIVE ──────────────────────────────────────────────────
    // Quand le livreur clique "En route vers station" (1er statut après assigned),
    // on annule toutes les autres livraisons pending pour la même commande
    if (dto.status === DeliveryStatus.EN_ROUTE_DEPOT) {
      await this.dataSource.query(`
        UPDATE deliveries
        SET status = 'cancelled', "updatedAt" = now()
        WHERE "orderId" = $1
          AND id != $2
          AND status = 'assigned'
      `, [delivery.order.id, deliveryId]);
    }

    delivery.status = dto.status;

    // ── LIVRAISON CONFIRMÉE ────────────────────────────────────────────────────
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

    // ── EN ROUTE VERS LE CLIENT ────────────────────────────────────────────────
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

    // ── CHARGEMENT À LA STATION ────────────────────────────────────────────────
    if (dto.status === DeliveryStatus.PICKED_UP) {
      delivery.order.status = OrderStatus.PREPARING;
      await this.ordersRepository.save(delivery.order);
    }

    const saved = await this.deliveriesRepository.save(delivery);
    this.deliveryGateway.emitDeliveryStatusUpdate(delivery.order.id, dto.status);
    return saved;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO-ASSIGNATION EN BROADCAST (appelé depuis orders.service.ts)
  //
  // Logique :
  // 1. Vérifier que l'adresse client est dans le rayon de la station (5km par défaut)
  // 2. Trouver TOUS les livreurs actifs qui couvrent ce dépôt (via depotIds ou commune)
  // 3. Créer UNE livraison par livreur avec statut "assigned"
  // 4. Quand l'un d'eux accepte (updateStatus → en_route_depot), les autres sont annulées
  // ─────────────────────────────────────────────────────────────────────────────
  async broadcastToDrivers(order: any, depotId: string) {
    try {
      // 1. Coordonnées et rayon du dépôt
      const depots = await this.dataSource.query(`
        SELECT latitude, longitude, "deliveryRadiusKm", commune
        FROM depots WHERE id = $1
      `, [depotId]);
      if (!depots.length) return;

      const depotLat  = parseFloat(depots[0].latitude);
      const depotLng  = parseFloat(depots[0].longitude);
      const rayonKm   = parseFloat(depots[0].deliveryRadiusKm) || 5;
      const commune   = depots[0].commune;

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
            console.log(`Commande ${order.id} hors rayon : ${distance.toFixed(1)}km > ${rayonKm}km`);
            return;
          }
        }
      }

      // 3. Trouver TOUS les livreurs actifs qui couvrent ce dépôt
      // Priorité : livreurs qui ont ce dépôt dans leur depotIds
      // Fallback : livreurs de la même commune
    const drivers = await this.dataSource.query(`
  SELECT DISTINCT dr."userId"
  FROM drivers dr
  WHERE dr."isActive" = true
    AND (
      $1::text = ANY(COALESCE(dr."depotIds", ARRAY[]::text[]))
      OR dr."depotId"::text = $1::text
      OR (
        dr."depotId" IS NULL
        AND (dr."depotIds" IS NULL OR array_length(dr."depotIds", 1) IS NULL)
        AND dr.zone = $2
      )
    )
`, [depotId, commune]);

      if (!drivers.length) {
        console.log(`Aucun livreur disponible pour le dépôt ${depotId}`);
        return;
      }

      console.log(`📡 Broadcast commande ${order.id} à ${drivers.length} livreur(s)`);

      // 4. Créer une livraison pour CHAQUE livreur disponible
      for (const driverRow of drivers) {
        const driverUser = await this.usersRepository.findOne({
          where: { id: driverRow.userId },
        });
        if (!driverUser) continue;

        const delivery      = new Delivery();
        delivery.order      = { id: order.id } as any;
        delivery.driver     = driverUser;
        delivery.status     = DeliveryStatus.ASSIGNED;
        delivery.assignedAt = new Date();
        delivery.etaMinutes = 30;

        await this.deliveriesRepository.save(delivery);
        console.log(`✅ Livraison créée pour livreur ${driverRow.userId}`);
      }

    } catch (err) {
      console.log('Broadcast error:', err);
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
}