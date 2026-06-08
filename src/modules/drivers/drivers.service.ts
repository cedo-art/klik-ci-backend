import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DriversService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  // Créer la colonne depotIds si elle n'existe pas
  async onModuleInit() {
    try {
      await this.dataSource.query(`
        ALTER TABLE drivers ADD COLUMN IF NOT EXISTS "depotIds" text[] DEFAULT '{}';
      `);
    } catch (e) {
      console.log('depotIds column already exists or error:', e.message);
    }
  }

  async getAll() {
    return this.dataSource.query(`
      SELECT
        dr.id, dr."fullName", dr.phone, dr."licenseNumber",
        dr.zone, dr."photoUrl", dr."isActive", dr."userId",
        dr."depotIds",
        d.name  AS "stationNom", d.id AS "stationId",
        t."plateNumber" AS "tricyclePlate", t.id AS "tricycleId"
      FROM drivers dr
      LEFT JOIN depots    d ON d.id = dr."depotId"
      LEFT JOIN tricycles t ON t."driverId" = dr.id
      ORDER BY dr."createdAt" DESC
    `);
  }

  async create(body: any) {
    const { fullName, phone, licenseNumber, zone, stationId, stationIds, photoUrl } = body;

    // stationIds = tableau de stations, stationId = station principale (première du tableau)
    const depotIds = stationIds && stationIds.length > 0 ? stationIds : (stationId ? [stationId] : []);
    const depotId  = depotIds[0] || null;

    const existingUser = await this.dataSource.query(
      `SELECT id FROM users WHERE phone = $1 LIMIT 1`, [phone]
    );

    let userId: string;
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
      await this.dataSource.query(
        `UPDATE users SET role = 'driver', "updatedAt" = now() WHERE id = $1`, [userId]
      );
    } else {
      const newUser = await this.dataSource.query(`
        INSERT INTO users (id, phone, role, "isActive", "isVerified", "createdAt", "updatedAt")
        VALUES (uuid_generate_v4(), $1, 'driver', true, true, now(), now())
        RETURNING id
      `, [phone]);
      userId = newUser[0].id;
    }

    const result = await this.dataSource.query(`
      INSERT INTO drivers (
        id, "fullName", phone, "licenseNumber", zone,
        "depotId", "depotIds", "photoUrl", "isActive", "userId", "createdAt", "updatedAt"
      )
      VALUES (
        uuid_generate_v4(), $1, $2, $3, $4,
        $5, $6, $7, true, $8, now(), now()
      )
      RETURNING *
    `, [fullName, phone, licenseNumber || null, zone || null,
        depotId, depotIds, photoUrl || null, userId]);

    return result[0];
  }

  async update(id: string, body: any) {
    const { fullName, phone, licenseNumber, zone, stationId, stationIds, photoUrl, isActive } = body;

    const depotIds = stationIds && stationIds.length > 0 ? stationIds : (stationId ? [stationId] : []);
    const depotId  = depotIds[0] || null;

    await this.dataSource.query(`
      UPDATE drivers SET
        "fullName"      = COALESCE($1, "fullName"),
        phone           = COALESCE($2, phone),
        "licenseNumber" = COALESCE($3, "licenseNumber"),
        zone            = COALESCE($4, zone),
        "depotId"       = $5,
        "depotIds"      = $6,
        "photoUrl"      = COALESCE($7, "photoUrl"),
        "isActive"      = COALESCE($8, "isActive"),
        "updatedAt"     = now()
      WHERE id = $9
    `, [fullName, phone, licenseNumber || null, zone || null,
        depotId, depotIds, photoUrl || null, isActive, id]);

    return { success: true };
  }

  async delete(id: string) {
    await this.dataSource.query(
      `UPDATE drivers SET "isActive" = false, "updatedAt" = now() WHERE id = $1`, [id]
    );
    return { success: true };
  }

  // ── Tricycles ──────────────────────────────────────────────────────────────
  async getTricycles() {
    return this.dataSource.query(`
      SELECT
        t.*,
        dr."fullName" AS "driverName",
        dr.phone      AS "driverPhone"
      FROM tricycles t
      LEFT JOIN drivers dr ON dr.id = t."driverId"
      ORDER BY t."createdAt" DESC
    `);
  }

  async createTricycle(body: any) {
    const { plateNumber, status, driverId } = body;
    const result = await this.dataSource.query(`
      INSERT INTO tricycles (id, "plateNumber", status, "driverId", "createdAt", "updatedAt")
      VALUES (uuid_generate_v4(), $1, $2, $3, now(), now())
      RETURNING *
    `, [plateNumber, status || 'disponible', driverId || null]);
    return result[0];
  }

  async updateTricycle(id: string, body: any) {
    const { plateNumber, status, driverId } = body;
    await this.dataSource.query(`
      UPDATE tricycles SET
        "plateNumber" = COALESCE($1, "plateNumber"),
        status        = COALESCE($2, status),
        "driverId"    = $3,
        "updatedAt"   = now()
      WHERE id = $4
    `, [plateNumber || null, status || null, driverId || null, id]);
    return { success: true };
  }

  async deleteTricycle(id: string) {
    await this.dataSource.query(`DELETE FROM tricycles WHERE id = $1`, [id]);
    return { success: true };
  }
}