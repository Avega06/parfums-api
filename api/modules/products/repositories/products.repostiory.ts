import {
  parfumTable,
  parfumTypeTable,
  shopTable,
  TransactionType,
} from "api/db/schema";
import { eq, sql } from "drizzle-orm";
import { db } from "api/db/index";
import { Product } from "../interfaces";

export class ProductRepository {
  async createProduct(product: Product, brandId: string, tx: TransactionType) {
    let parfumId: string | undefined;

    const typeResult = await db
      .select()
      .from(parfumTypeTable)
      .where(eq(parfumTypeTable.name, product.type_parfum));

    const typeId = typeResult.at(0)?.typeId ?? null;

    const productValue = {
      name: product.product!,
      volume: product.volume ?? "0 ML",
      brand: brandId ?? null,
      typeId: +typeId!,
    };

    console.log("Insertando producto con valores:", productValue);

    try {
      const inserted = await tx
        .insert(parfumTable)
        .values(productValue)
        .returning({ productId: parfumTable.parfumId })
        .onConflictDoNothing();

      console.log("Resultado del insert:", inserted);

      if (inserted.length === 0) {
        const existing = await tx
          .select({ productId: parfumTable.parfumId })
          .from(parfumTable)
          .where(eq(parfumTable.name, productValue.name));

        console.log("Producto existente:", existing);

        if (existing.length > 0) {
          parfumId = existing[0].productId;
        }
      } else {
        parfumId = inserted[0].productId;
      }

      if (!parfumId) {
        throw new Error("No se pudo obtener el parfumId");
      }

      return parfumId;
    } catch (error) {
      console.error("Error al crear el producto:", error);
      throw error;
    }
  }

  async getProductByTerm(term: string) {
    return db
      .select({
        id: parfumTable.parfumId,
        name: parfumTable.name,
      })
      .from(parfumTable)
      .where(sql`${parfumTable.name} LIKE ${`%${term}%`} COLLATE NOCASE`)
      .limit(10);
  }

  getProductShopByName(shopName: string) {
    return db.select().from(shopTable).where(eq(shopTable.name, shopName));
  }
}
