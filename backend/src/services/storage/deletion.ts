import type { Prisma } from '../../generated/prisma/client.js';
export async function enqueueDeletion(tx: Prisma.TransactionClient, keys: string[]) {
  if (keys.length)
    await tx.storageDeletion.createMany({
      data: keys.map((storageKey) => ({ storageKey })),
      skipDuplicates: true,
    });
}
