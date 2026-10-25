import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
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

  // Nuevas columnas de relación
  fragranticaId: integer("fragrantica_id").references(
    () => fragranticaMetadataTable.fragranticaId,
    { onDelete: "set null" },
  ),
  confidence: text("confidence").default("low"),
});

// Tabla Fragrantica Metadata
export const fragranticaMetadataTable = sqliteTable("fragrantica_metadata", {
  fragranticaId: integer("fragrantica_id").primaryKey(),
  brand: text("brand"),
  name: text("name"),
  year: integer("year"),
  gender: text("gender"),
  longevityAverage: real("longevity_average"),
  longevityHistogram: text("longevity_histogram", { mode: "json" }).$type<
    { bucket: number; count: number }[]
  >(),
  sillageAverage: real("sillage_average"),
  sillageHistogram: text("sillage_histogram", { mode: "json" }).$type<
    { bucket: number; count: number }[]
  >(),
});

// Tabla de Notas
export const notesTable = sqliteTable("notes", {
  noteId: integer("note_id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nameEs: text("name_es"),
  imageId: integer("image_id"),
});

// Tabla Intermedia Fragrantica <-> Notes
export const fragranticaNotesTable = sqliteTable("fragrantica_notes", {
  fragranticaId: integer("fragrantica_id")
    .notNull()
    .references(() => fragranticaMetadataTable.fragranticaId, {
      onDelete: "cascade",
    }),
  noteId: integer("note_id")
    .notNull()
    .references(() => notesTable.noteId, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["top", "middle", "base", "flat"] }).notNull(),
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
  shopLink: text("shop_link"),
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

// --- Drizzle Relational Mappings ---

export const parfumRelations = relations(parfumTable, ({ one }) => ({
  fragrantica: one(fragranticaMetadataTable, {
    fields: [parfumTable.fragranticaId],
    references: [fragranticaMetadataTable.fragranticaId],
  }),
}));

export const fragranticaRelations = relations(
  fragranticaMetadataTable,
  ({ many }) => ({
    notes: many(fragranticaNotesTable),
  }),
);

export const fragranticaNotesRelations = relations(
  fragranticaNotesTable,
  ({ one }) => ({
    fragrantica: one(fragranticaMetadataTable, {
      fields: [fragranticaNotesTable.fragranticaId],
      references: [fragranticaMetadataTable.fragranticaId],
    }),
    note: one(notesTable, {
      fields: [fragranticaNotesTable.noteId],
      references: [notesTable.noteId],
    }),
  }),
);

export type InsertParfum = typeof parfumTable.$inferInsert;
export type SelectParfum = typeof parfumTable.$inferSelect;

export type InsertShop = typeof shopTable.$inferInsert;
export type SelectShop = typeof shopTable.$inferSelect;

export type InsertList = typeof listTable.$inferInsert;
export type SelectList = typeof listTable.$inferSelect;

export type InsertBrands = typeof parfumBrandsTable.$inferInsert;
export type SelectBrands = typeof parfumBrandsTable.$inferSelect;

// --- Tipos de datos para el JSON de Fragrantica ---

export type NoteItem = {
  note_id: number;
  name: string;
  name_es: string | null;
  image_id: number | null;
};

export type FragranticaData = {
  id: number;
  brand: string | null;
  name: string | null;
  year: number | null;
  gender: string | null;
  longevity: {
    average: number | null;
    histogram: { bucket: number; count: number }[];
  };
  sillage: {
    average: number | null;
    histogram: { bucket: number; count: number }[];
  };
  notes: {
    tiered: {
      top: NoteItem[];
      middle: NoteItem[];
      base: NoteItem[];
    };
    flat: NoteItem[];
  };
};

// --- Mapeo del esquema de la vista creada en Turso ---

export const vParfumsFragrantica = sqliteTable("v_parfums_fragrantica", {
  parfumId: text("parfum_id").notNull(),
  parfumName: text("parfum_name").notNull(),
  fragrantica: text("fragrantica", {
    mode: "json",
  }).$type<FragranticaData | null>(),
});

export type SelectVParfumsFragrantica = typeof vParfumsFragrantica.$inferSelect;
