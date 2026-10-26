import { TransactionType } from '@prisma/client';
import { createDefaultCategories, DEFAULT_CATEGORIES } from './default-categories';

describe('createDefaultCategories', () => {
  const userId = 'user-id';
  const total = Object.keys(DEFAULT_CATEGORIES.EXPENSE).length + Object.keys(DEFAULT_CATEGORIES.INCOME).length;

  const buildTx = (existing: { name: string; type: TransactionType }[] = []) => ({
    category: {
      findMany: jest.fn().mockResolvedValue(existing),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  it('should create every default category and the Prestamos subcategories', async () => {
    const tx = buildTx();

    const created = await createDefaultCategories(tx as any, userId);

    expect(created).toBe(total);
    expect(tx.category.findMany).not.toHaveBeenCalled();
    expect(tx.category.createMany.mock.calls[0][0].data).toHaveLength(total);
    expect(tx.category.createMany.mock.calls[1][0].data.map((c: any) => c.name)).toEqual(['Persona 1', 'Persona 2']);
  });

  it('should skip the defaults the user already has when onlyMissing is set', async () => {
    // Same name with another type does not count: "Otros" exists as EXPENSE only
    const tx = buildTx([
      { name: 'Alimentación', type: TransactionType.EXPENSE },
      { name: 'Prestamos', type: TransactionType.EXPENSE },
      { name: 'Otros', type: TransactionType.EXPENSE },
      { name: 'Mis gastos', type: TransactionType.EXPENSE },
    ]);

    const created = await createDefaultCategories(tx as any, userId, { onlyMissing: true });

    expect(tx.category.findMany).toHaveBeenCalledWith({ where: { userId, parentId: null }, select: { name: true, type: true } });
    expect(created).toBe(total - 3);
    const parents = tx.category.createMany.mock.calls[0][0].data;
    const keys = parents.map((c: any) => `${c.type}/${c.name}`);
    expect(keys).not.toContain('EXPENSE/Alimentación');
    expect(keys).not.toContain('EXPENSE/Otros');
    expect(keys).toContain('INCOME/Otros');
    // Prestamos already exists, so its subcategories are not created either
    expect(tx.category.createMany).toHaveBeenCalledTimes(1);
  });

  it('should create nothing when the user already has every default', async () => {
    const all = (['EXPENSE', 'INCOME'] as const).flatMap((type) =>
      Object.keys(DEFAULT_CATEGORIES[type]).map((name) => ({ name, type: TransactionType[type] })),
    );
    const tx = buildTx(all);

    expect(await createDefaultCategories(tx as any, userId, { onlyMissing: true })).toBe(0);
    expect(tx.category.createMany).not.toHaveBeenCalled();
  });
});
