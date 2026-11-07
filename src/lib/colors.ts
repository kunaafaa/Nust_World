import type { Category } from './types';

export const CAT_COLOR: Record<Category, string> = {
  academic: '#4f8cff',
  hostel: '#ff8a5b',
  food: '#f5b800',
  sports: '#22b573',
  admin: '#a78bfa',
  gate: '#ef4444',
  prayer: '#14b8a6',
  parking: '#94a3b8',
  medical: '#fb7185',
  atm: '#16a34a',
  other: '#64748b',
};

/** Higher = label survives crowding at low zoom. */
export const CAT_PRIORITY: Record<Category, number> = {
  academic: 100,
  gate: 90,
  admin: 80,
  prayer: 75,
  hostel: 70,
  food: 60,
  sports: 55,
  medical: 50,
  other: 30,
  atm: 20,
  parking: 10,
};

export const CAT_LABEL: Record<Category, string> = {
  academic: 'Academic',
  hostel: 'Hostels',
  food: 'Food',
  sports: 'Sports',
  admin: 'Admin',
  gate: 'Gates',
  prayer: 'Prayer',
  parking: 'Parking',
  medical: 'Medical',
  atm: 'ATMs',
  other: 'Other',
};
