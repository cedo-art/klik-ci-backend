import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Address)
    private addressesRepository: Repository<Address>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async getProfile(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['addresses'],
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return user;
  }

  async getClients() {
    return this.dataSource.query(`
      SELECT
        u.id,
        u.phone,
        u."fullName",
        u."isActive",
        u."isVerified",
        u."createdAt",
        COUNT(DISTINCT o.id)::int             AS "totalCommandes",
        COALESCE(SUM(o."totalFcfa"), 0)::int  AS "totalDepense",
        MAX(o."createdAt")                    AS "derniereCommande",
        a."fullAddress"                       AS "adresse",
        a.commune
      FROM users u
      LEFT JOIN orders  o ON o.client_id = u.id
      LEFT JOIN addresses a ON a.user_id = u.id AND a."isDefault" = true
      WHERE u.role = 'client'
      GROUP BY u.id, a."fullAddress", a.commune
      ORDER BY u."createdAt" DESC
    `);
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    // Log pour déboguer les coordonnées reçues
    console.log('[createAddress] userId:', userId);
    console.log('[createAddress] dto reçu:', JSON.stringify(dto));
    console.log('[createAddress] latitude:', dto.latitude, typeof dto.latitude);
    console.log('[createAddress] longitude:', dto.longitude, typeof dto.longitude);

    if (dto.isDefault) {
      await this.addressesRepository.update(
        { user: { id: userId } },
        { isDefault: false },
      );
    }

    // Forcer la conversion en nombre au cas où les valeurs arrivent en string
    const address = this.addressesRepository.create({
      ...dto,
      latitude:  dto.latitude  != null ? Number(dto.latitude)  : null,
      longitude: dto.longitude != null ? Number(dto.longitude) : null,
      user: { id: userId } as any,
    });

    console.log('[createAddress] address à sauvegarder:', JSON.stringify({
      latitude:  address.latitude,
      longitude: address.longitude,
    }));

    return this.addressesRepository.save(address);
  }

  async getAddresses(userId: string) {
    return this.addressesRepository.find({
      where: { user: { id: userId } },
      order: { isDefault: 'DESC' },
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.addressesRepository.findOne({
      where: { id: addressId, user: { id: userId } },
    });
    if (!address) throw new NotFoundException('Adresse non trouvée');
    await this.addressesRepository.remove(address);
    return { message: 'Adresse supprimée' };
  }
}