import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";
import { db } from ".";

export type TransactionType = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export const parfumTable = sqliteTable("parfum", {
  parfumId: text("parfum_id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull().unique(),
  brand: text("brand_id").references(() => parfumBrandsTable.brandId, {
    onDelete: "set null",
  }),
  volume: text("volume").notNull(),
  typeId: integer("type_id").references(() => parfumTypeTable.typeId, {
    onDelete: "cascade",
  }),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  deletedAt: text("deleted_at"),
});

export const parfumBrandsTable = sqliteTable("brands_type", {
  brandId: text("brand_id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull().unique(),
});

export const parfumTypeTable = sqliteTable("parfum_type", {
  typeId: integer("type_id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const shopTable = sqliteTable("shops", {
  shopId: text("shop_id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull().unique(),
  address: text("address"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  deletedAt: text("deleted_at"),
});

export const shopInfoView = sqliteTable("shop_info", {
  shopId: text("shop_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  isDeleted: integer("is_deleted").notNull(),
  deletedAt: text("deleted_at"),
  typeId: integer("type_id").notNull(),
  type: text("type").notNull(),
});

export const listTable = sqliteTable("list_parfums", {
  listId: text("list_id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  shopId: text("shop_id")
    .references(() => shopTable.shopId, { onDelete: "cascade" })
    .notNull(),
  parfumId: text("parfum_id")
    .references(() => parfumTable.parfumId, { onDelete: "cascade" })
    .notNull(),
  price: real("price").default(0),
  link: text("link"),
  imageUrl: text("image_url"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  deletedAt: text("deleted_at"),
  updatedAt: text("updated_at"),
});

export const listProductPaginated = sqliteTable("list_product_paginated", {
  parfumId: text("parfum_id").notNull(),
  product: text("product").notNull(),
  price: real("price"),
  volume: text("volume"),
  imageUrl: text("image_url"),
  link: text("link"),
  type: text("type"),
  brand: text("brand"),
  shop: text("shop"),
});

export const countProductTable = sqliteTable("count_products", {
  id: text("id").$default(() => "total_row"),
  total_products: integer("total_products").notNull(),
});

export type InsertParfum = typeof parfumTable.$inferInsert;
export type SelectParfum = typeof parfumTable.$inferSelect;

export type InsertShop = typeof shopTable.$inferInsert;
export type SelectShop = typeof shopTable.$inferSelect;

export type InsertList = typeof listTable.$inferInsert;
export type SelectList = typeof listTable.$inferSelect;

export type InsertBrands = typeof parfumBrandsTable.$inferInsert;
export type SelectBrands = typeof parfumBrandsTable.$inferSelect;
