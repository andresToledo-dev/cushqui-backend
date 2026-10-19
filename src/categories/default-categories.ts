import { Prisma, TransactionType } from '@prisma/client';
import { randomUUID } from 'crypto';

type DefaultCategory = { icon: string; color: string; subcategories?: string[] };

/**
 * Categories every new user starts with (POST /auth/register and the seed).
 * They belong to the user, who can edit or delete them like any other category.
 */
export const DEFAULT_CATEGORIES: Record<'EXPENSE' | 'INCOME', Record<string, DefaultCategory>> = {
  EXPENSE: {
    Café: { icon: '☕', color: '#6D4C41' },
    Transporte: { icon: '🚌', color: '#1E88E5' },
    Alimentación: { icon: '🍔', color: '#E53935' },
    Viaje: { icon: '✈️', color: '#00897B' },
    Ocio: { icon: '🎮', color: '#8E24AA' },
    Subscripcion: { icon: '📱', color: '#5E35B1' },
    Prestamos: { icon: '💰', color: '#FF6B35', subcategories: ['Persona 1', 'Persona 2'] },
    Rutina: { icon: '🔁', color: '#546E7A' },
    Casa: { icon: '🏠', color: '#43A047' },
    Salud: { icon: '💊', color: '#C62828' },
    Carro: { icon: '🚗', color: '#3949AB' },
    Otros: { icon: '📦', color: '#95A5A6' },
  },
  INCOME: {
    Otros: { icon: '📦', color: '#95A5A6' },
    Salario: { icon: '💼', color: '#1565C0' },
    Interés: { icon: '💹', color: '#00695C' },
    Inversion: { icon: '📊', color: '#2E7D32' },
    Regalo: { icon: '🎀', color: '#C2185B' },
  },
};

/** Lightens a #RRGGBB color by a percentage towards white */
export function lightenColor(hex: string, percent: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (c: number) => Math.min(255, Math.round(c + (255 - c) * (percent / 100)));
  const toHex = (c: number) => channel(c).toString(16).padStart(2, '0');
  return `#${toHex((value >> 16) & 255)}${toHex((value >> 8) & 255)}${toHex(value & 255)}`;
}

/**
 * Creates the default categories for a user inside the caller's transaction.
 * Subcategories inherit icon and type; their colors follow the frontend convention
 * (parent lightened 20%, then each one 15% lighter than the previous).
 */
export async function createDefaultCategories(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const parents: Prisma.CategoryCreateManyInput[] = [];
  const children: Prisma.CategoryCreateManyInput[] = [];

  for (const type of [TransactionType.EXPENSE, TransactionType.INCOME] as const) {
    for (const [name, def] of Object.entries(DEFAULT_CATEGORIES[type])) {
      const id = randomUUID();
      parents.push({ id, userId, name, type, icon: def.icon, color: def.color });

      let color = def.color;
      (def.subcategories ?? []).forEach((subName, index) => {
        color = lightenColor(color, index === 0 ? 20 : 15);
        children.push({ userId, name: subName, type, icon: def.icon, color, parentId: id });
      });
    }
  }

  await tx.category.createMany({ data: parents });
  await tx.category.createMany({ data: children });
}
