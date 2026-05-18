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

export const ListProductsParamsSchema = z
  .object({
    // 1. Definimos los parámetros de paginación
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).default(10),

    // 2. Definimos los posibles filtros (planos)
    shop: z.string().optional(),
    type_parfum: z.string().optional(),
    audience: z.string().optional(),
    price_range: z.string().optional(),
  })
  .transform((data) => {
    // 3. Extraemos page y limit, y agrupamos el resto en 'filters'
    const { page, limit, ...rest } = data;

    return {
      page,
      limit,
      // Solo incluimos en el objeto filters aquellos que no sean undefined
      filters: rest,
    };
  });

// Tipo resultante del parseo
export type ListProductsParams = z.output<typeof ListProductsParamsSchema>;

export const ProductsSchema = z.object({
  products: z.array(z.unknown()).min(1, "At least one product is required"),
});
