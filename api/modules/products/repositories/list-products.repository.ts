import {
  countProductTable,
  listProductPaginated,
  listTable,
  parfumBrandsTable,
  parfumTable,
  parfumTypeTable,
  shopTable,
  TransactionType,
} from "api/db/schema";
import { Product, ProductUpdate } from "../interfaces";
import { and, eq, sql } from "drizzle-orm";
import { db } from "api/db/index";

export class ListProductsRepository {
  async createListProduct(
    product: Product,
    productId: string,
    tx: TransactionType
  ) {
    const resultShop = await tx
      .select({ id: shopTable.shopId })
      .from(shopTable)
      .where(eq(shopTable.name, product.shop));

    const shopId = resultShop.at(0)!.id;

    if (isNaN(product.price)) product.price = 0;
    console.log("productId:", product);

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

  async getListProductPaginated(page: number, limit: number, term?: string) {
    try {
      const conditions = [];

      const totalPages = await this.getPageQuantityByProductCount(limit);
      if (term) {
        conditions.push(eq(listProductPaginated.product, term));
      }

      const result = await db
        .select()
        .from(listProductPaginated)
        .limit(limit)
        .offset((page - 1) * limit)
        .where(and(...conditions));

      return {
        term: term,
        pages: `${totalPages}`,
        result,
      };
    } catch (error) {
      console.error(error);
    }
  }

  async getPageQuantityByProductCount(limit: number): Promise<number> {
    const totalproductsCount = await db
      .select({ totalProducts: countProductTable.total_products })
      .from(countProductTable)
      .where(eq(countProductTable.id, "total_row"));
    const pagesQuantity = Math.round(
      totalproductsCount.at(0)?.totalProducts! / limit
    );

    return pagesQuantity;
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
