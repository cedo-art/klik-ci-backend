import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

@Injectable()
export class MapsProvider {

  async geocodeAddress(address: string, city = 'Abidjan') {
    try {
      const query = `${address}, ${city}, Côte d'Ivoire`;
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: query, format: 'json', limit: 1, countrycodes: 'ci' },
        headers: { 'User-Agent': 'GazExpress-CI/1.0' },
        httpsAgent,
      });
      if (response.data.length === 0) return null;
      const result = response.data[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        displayName: result.display_name,
      };
    } catch (error) {
      console.error('Geocoding error:', error.message);
      return null;
    }
  }

  calculateStraightDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  estimateEta(distanceKm: number): number {
    // Vitesse moyenne livreur moto Abidjan : ~20 km/h
    return Math.max(5, Math.round((distanceKm / 20) * 60));
  }

  async getNearbyDepots(
    clientLat: number,
    clientLng: number,
    depots: any[],
  ) {
    const depotsWithDistance = depots
      .map((depot) => {
        const distanceKm = this.calculateStraightDistance(
          clientLat, clientLng,
          parseFloat(depot.latitude),
          parseFloat(depot.longitude),
        );

        if (distanceKm > depot.deliveryRadiusKm) return null;

        return {
          ...depot,
          distanceKm,
          etaMinutes: this.estimateEta(distanceKm),
        };
      })
      .filter((d) => d !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return depotsWithDistance;
  }
}