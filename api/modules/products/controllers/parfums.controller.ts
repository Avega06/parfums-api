import { Context, Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ListProductsParamsSchema,
  ProductsSchema,
} from "api/modules/products/validators";
import {
  BrandsRepository,
  ProductRepository,
  ShopInfoRepository,
} from "../repositories";
import { ProductsService } from "../services";
import { ListProductsRepository } from "../repositories/list-products.repository";
import { ShopService } from "../services/shops.service";

export const parfumsController = new Hono();

const productRepository = new ProductRepository();
const brandsRepository = new BrandsRepository();
const listProductsRepository = new ListProductsRepository();

const productsService = new ProductsService(
  productRepository,
  brandsRepository,
  listProductsRepository
);

const shopInfoRepository = new ShopInfoRepository();
const shopService = new ShopService(shopInfoRepository);

parfumsController.get(
  "/",
  zValidator("query", ListProductsParamsSchema),
  async (c: Context) => {
    const { page, limit } = ListProductsParamsSchema.parse(c.req.query());
    const result = await productsService.getProductListPaginated(page, limit);
    return c.json({ result });
  }
);

parfumsController.get("/product/:term", async (c: Context) => {
  const term = c.req.param("term");

  const result = await productsService.getProductByName(term);

  return c.json(result);
});

parfumsController.get("/product_term/:term", async (c: Context) => {
  const term = c.req.param("term");

  console.log(term);

  const result = await productsService.getProductByTerm(term);

  return c.json({
    products: result,
  });
});

parfumsController.get("/shop/:name", async (c: Context) => {
  const name = c.req.param("name");

  const shop = await shopInfoRepository.getShopInfoByName(name);

  return c.json(shop);
});

parfumsController.post(
  "/add-products",
  zValidator("json", ProductsSchema),
  async (c: Context) => {
    const { products } = await c.req.json();
    const newProducts = await productsService.saveProducts(products);
    return c.json({ products: newProducts });
  }
);
