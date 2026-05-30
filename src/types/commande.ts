// ── Types commande Klik CI ──────────────────────────────────────

export type ModeLivraison = 'standard' | 'rapide' | 'express';

export interface FraisLivraison {
  mode: ModeLivraison;
  label: string;
  icon: string;
  priceFcfa: number;
  delai: string;
  description: string;
}

export const MODES_LIVRAISON: FraisLivraison[] = [
  {
    mode: 'standard',
    label: 'Standard',
    icon: '⏱',
    priceFcfa: 600,
    delai: '45–90 min',
    description: 'Planifier pour plus tard',
  },
  {
    mode: 'rapide',
    label: 'Rapide',
    icon: '⚡',
    priceFcfa: 1000,
    delai: '20–45 min',
    description: 'Le plus populaire',
  },
  {
    mode: 'express',
    label: 'Express',
    icon: '🚀',
    priceFcfa: 1500,
    delai: '< 20 min',
    description: 'Tricycle dédié immédiat',
  },
];

export interface Station {
  id: string;
  name: string;
  brand: 'total' | 'oryx' | 'shell' | 'petroci' | 'petro_ivoire';
  address: string;
  latitude: number;
  longitude: number;
  distance?: number;
  hasStock: boolean;
  delaiEstime?: number;
}

export interface CommandeItem {
  productId: string;
  quantity: number;
  returnEmpty?: boolean;
}

export interface CreateCommandePayload {
  depotId: string;
  deliveryAddressId: string | null;
  type: 'express' | 'standard' | 'scheduled';
  modeLivraison: ModeLivraison;
  fraisLivraison: number;
  items: CommandeItem[];
}

export interface Commande {
  id: string;
  status: string;
  modeLivraison: ModeLivraison;
  fraisLivraison: number;
  totalFcfa: number;
  station?: Station;
  createdAt: string;
}