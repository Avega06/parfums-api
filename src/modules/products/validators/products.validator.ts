import { z } from "zod";

// const ProductSchema = z.object({
//   product: z.string().min(1, "Product name is required"),
//   price: z
//     .string()
//     .regex(/^\$\d{1,3}(\.\d{3})*(,\d{2})?$/, "Invalid price format"),
//   //   product_link: z
//   //     .string()
//   //     .url("Invalid product link URL")
//   //     .or(z.string().regex(/^\/collections\/[a-z0-9-]+\/products\/[a-z0-9-]+$/)),
//   image: z.string().url("Invalid image URL"),
//   type_parfum: z.enum(["EDP", "EDT", "Other"]),
//   shop: z.string().min(1, "Shop is required"),
// });

export const ListProductsParamsSchema = z.object({
  page: z.coerce.number().int().min(1),
  limit: z.coerce.number().int().min(1),
});

export const ProductsSchema = z.object({
  products: z.array(z.unknown()).min(1, "At least one product is required"),
});
