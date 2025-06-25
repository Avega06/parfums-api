import { eq } from "drizzle-orm";
import { db } from "api/db";
import { parfumBrandsTable } from "api/db/schema";
import { seed, Brand } from "../configs";

export class BrandsRepository {
  constructor() {
    this.runSeed();
  }

  async runSeed() {
    await seed();
  }

  async getBrands() {
    return await db.select().from(parfumBrandsTable);
  }

  async getBrandWithName(name: string) {
    return (
      (
        await db
          .select({
            brandId: parfumBrandsTable.brandId,
          })
          .from(parfumBrandsTable)
          .where(eq(parfumBrandsTable.name, name))
      )[0] ?? undefined
    );
  }

  async insertBrands(brandsToInsert: Brand[]) {
    await db
      .insert(parfumBrandsTable)
      .values(brandsToInsert)
      .onConflictDoNothing();
  }
}
