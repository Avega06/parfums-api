import {
  countProductTable,
  listProductPaginated,
  listTable,
  shopTable,
  TransactionType,
} from "api/db/schema";
import { Product, ProductFilters, ProductUpdate } from "../interfaces";
import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "api/db/index";

export class ListProductsRepository {
  private totalPagesCache = new Map<
    string,
    { count: number; expires: number }
  >();

  private readonly CACHE_TTL = 1000 * 60 * 60 * 24;
  private readonly MAX_CACHE_SIZE = 2000;

  async createListProduct(
    product: Product,
    productId: string,
    tx: TransactionType,
  ) {
    this.invalidateCache(product.shop);

    const resultShop = await tx
      .select({ id: shopTable.shopId })
      .from(shopTable)
      .where(eq(shopTable.name, product.shop));

    const shopId = resultShop.at(0)!.id;

    if (isNaN(product.price)) product.price = 0;

    const detail = {
      parfumId: productId!,
      link: product.product_link,
      price: product.price,
      imageUrl: product.image,
      shopId: shopId!,
    };

    try {
      const listInsert = await tx
        .insert(listTable)
        .values(detail)
        .returning({ detailId: listTable.listId });

      return {
        detailId: listInsert.at(0)!.detailId,
        price: product.price,
        image_url: product.image,
        product_link: product.product_link,
      };
    } catch (error) {
      console.error(error);
      throw new Error(`${error}`);
    }
  }

  private generateCacheKey(term?: string, filters?: ProductFilters): string {
    return `total:${filters?.shop ?? "all"}:${filters?.type_parfum ?? "all"}:${term?.trim().toLowerCase() ?? "none"}`;
  }

  private invalidateCache(shopName?: string) {
    if (!shopName) return;
    for (const key of this.totalPagesCache.keys()) {
      if (key.includes(`:${shopName}:`)) {
        this.totalPagesCache.delete(key);
      }
    }
  }

  async getListProductPaginated(
    page: number,
    limit: number,
    term?: string,
    filters?: ProductFilters,
  ) {
    try {
      const conditions = [];
      if (filters?.shop)
        conditions.push(eq(listProductPaginated.shop, filters.shop));
      if (filters?.type_parfum)
        conditions.push(eq(listProductPaginated.type, filters.type_parfum));
      if (term)
        conditions.push(ilike(listProductPaginated.product, `%${term}%`));

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (page - 1) * limit;
      const cacheKey = this.generateCacheKey(term, filters);
      const now = Date.now();

      let totalCount: number;
      let result: any[];

      const cachedData = this.totalPagesCache.get(cacheKey);

      console.log(cachedData);

      if (cachedData && now < cachedData.expires) {
        totalCount = cachedData.count;
        result = await db
          .select()
          .from(listProductPaginated)
          .where(whereClause)
          .limit(limit)
          .offset(offset);
      } else {
        if (this.totalPagesCache.size >= this.MAX_CACHE_SIZE) {
          this.totalPagesCache.clear();
        }

        const [totalQuery, dataQuery] = await db.batch([
          db
            .select({
              count:
                sql<number>`count(${listProductPaginated.parfumId})`.mapWith(
                  Number,
                ),
            })
            .from(listProductPaginated)
            .where(whereClause),

          db
            .select()
            .from(listProductPaginated)
            .where(whereClause)
            .limit(limit)
            .offset(offset),
        ]);

        totalCount = totalQuery.at(0)?.count ?? 0;
        result = dataQuery;

        this.totalPagesCache.set(cacheKey, {
          count: totalCount,
          expires: now + this.CACHE_TTL,
        });
      }

      const totalPages = Math.ceil(totalCount / limit);

      return {
        term: term ?? null,
        pages: `${totalPages}`,
        totalItems: totalCount,
        result,
      };
    } catch (error) {
      console.error("Error in getListProductPaginated:", error);
      throw error;
    }
  }

  async updateListProduct(product: ProductUpdate, detailId: string) {
    try {
      await db
        .update(listTable)
        .set({ updatedAt: sql`CURRENT_TIMESTAMP`, ...product })
        .where(eq(listTable.listId, detailId))
        .returning({ detailId: listTable.listId });

      return {
        ...product,
      };
    } catch (error) {
      console.error(error);
    }
  }

  async getProductByTerm(term: string, limit: number = 10) {
    return db
      .select({
        id: listProductPaginated.parfumId,
        name: listProductPaginated.product,
        shop: listProductPaginated.shop,
      })
      .from(listProductPaginated)
      .where(
        sql`${listProductPaginated.product} LIKE ${`%${term}%`} COLLATE NOCASE`,
      )
      .limit(limit);
  }

  async getProductByName(productName: string) {
    const result = await db
      .select()
      .from(listProductPaginated)
      .where(eq(listProductPaginated.product, productName));

    console.log(result);

    return result;
  }
}
