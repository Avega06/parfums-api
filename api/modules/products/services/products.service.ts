import { RedisClientType } from "redis";
import { getClientConnection } from "api/adapters/redis.adapter";
import { db } from "api/db/index";

import { type BrandsService } from "./brands.service";
import { ProductRepository, ListProductsRepository } from "../repositories";

import {
  Product,
  ProductCached,
  ProductFilters,
  ProductUpdate,
} from "../interfaces";

import {
  cleanText,
  normalizeUrl,
  parseCurrencyWithLocale,
  slugify,
  stringMatched,
} from "api/helpers/index";

import { scrapperModel } from "api/modules/scrapper/configs/scrapping.model";

export class ProductsService {
  #websiteConfig = scrapperModel.scraping_config;
  private redisClient!: RedisClientType;

  constructor(
    private productRepository: ProductRepository,
    private brandsService: BrandsService,
    private listProductsRepository: ListProductsRepository,
  ) {
    this.initRedis();
  }

  private async initRedis() {
    try {
      this.redisClient = await getClientConnection();
    } catch (err) {
      console.error("Error al inicializar Redis:", err);
    }
  }

  async saveProducts(products: Product[]) {
    console.log(`Procesando ${products.length} productos...`);
    const newProducts: Product[] = [];

    for (const product of products) {
      const processedProduct =
        await this.brandsService.addBrandsByProducts(product);

      const cleanedProduct = await this.cleanProductsData(processedProduct);

      const productKey = `product:${slugify(cleanedProduct.product)}:${slugify(
        cleanedProduct.shop,
      )}`;
      const cached = await this.redisClient.get(productKey);

      if (!cached) {
        // console.log(
        //   `Producto ${cleanedProduct.product} no encontrado en caché.`
        // );
        await this.addProduct(cleanedProduct, productKey);
      } else {
        let productCached = JSON.parse(cached!) as ProductCached;

        const result = await this.validateProductToUpdate(
          cleanedProduct,
          productCached,
        );

        if (result) {
          console.log(
            `Clave de Redis para ${cleanedProduct.product}: ${productKey}`,
          );
          console.log(
            `Producto ${cleanedProduct.product} encontrado en caché:`,
            productCached,
          );
          console.log("resultado", result);
          console.log("cleaned (antes de guardar en caché)", cleanedProduct);
          console.log(
            "productCached (antes de guardar en caché)",
            productCached,
          );
          console.log("Resultado de la validación:", result, productKey);
          await this.redisClient.set(productKey, JSON.stringify(result));
        }
      }

      newProducts.push(cleanedProduct);
    }

    await this.brandsService.saveBrands();
    return newProducts;
  }

  async cleanProductsData(parfum: Product): Promise<Product> {
    const linkedWebsites = this.filterLinkWebsites();
    const volumeRegExp = /(\d+)\s*ml/i;
    const nameRegExp = /E(?:DP|DT|DC|OP)/gi;

    const result = stringMatched(parfum.product, volumeRegExp);
    if (result) parfum.volume = result[0];

    const parfumNameCleaned = cleanText(parfum.product, nameRegExp);
    parfum.product = parfumNameCleaned;

    for (const { website_name, linkUrl, protocol } of linkedWebsites) {
      if (website_name === parfum.shop) {
        const productUrl = linkUrl.url!;
        parfum.product_link = `${productUrl}${parfum.product_link}`;
      }
      const hasProtocolUrl = parfum.image.includes("https:");
      if (!hasProtocolUrl) {
        parfum.image = `https:${parfum.image}`;
      }
    }

    if (parfum.price) {
      parfum.price = parseCurrencyWithLocale(parfum.price!, "es-CL");
    }

    return parfum;
  }

  async addProduct(product: Product, productKey: string) {
    let brandId: string;
    try {
      brandId = (await this.brandsService.getBrandByProduct(product)) ?? "";

      await db.transaction(async (tx) => {
        const productId = await this.productRepository.createProduct(
          product,
          brandId,
          tx,
        );

        // console.log("productDetails", productId, product);

        const productDetail =
          await this.listProductsRepository.createListProduct(
            product,
            productId!,
            tx,
          );

        await this.redisClient.set(productKey, JSON.stringify(productDetail));
      });

      return product;
    } catch (error) {
      console.error(`Transaction error`, error);
    }
  }

  async validateProductToUpdate(
    product: Product,
    productCached: ProductCached,
  ) {
    // console.log("validando producto", product, productCached);
    const normalizedPrice = Number(product.price || 0);
    const normalizedImage = normalizeUrl(product.image);
    const normalizedLink = product.product_link?.trim() || "";

    const cachedPrice = Number(productCached.price || 0);
    const cachedImage = normalizeUrl(productCached.image_url);
    const cachedLink = productCached.product_link?.trim() || "";

    const productToUpdate: ProductUpdate = {};

    if (normalizedPrice !== cachedPrice) {
      productToUpdate.price = normalizedPrice;
    }

    if (normalizedImage !== cachedImage) {
      productToUpdate.image_url = normalizedImage;
    }

    if (normalizedLink !== cachedLink) {
      productToUpdate.product_link = normalizedLink;
    }

    if (Object.keys(productToUpdate).length === 0) {
      // console.log("No se encontraron cambios en el producto.");
      return;
    }

    console.log(
      "Datos a actualizar en la base de datos:",
      productToUpdate,
      productCached.detailId,
    );
    // Actualizar en la base de datos mediante el repositorio
    await this.listProductsRepository.updateListProduct(
      productToUpdate,
      productCached.detailId,
    );
    console.log(
      `Producto con detailId ${productCached.detailId} actualizado en la base de datos.`,
    );

    // Retornar la fusión de datos cacheados actualizados y nuevos
    return {
      detailId: productCached.detailId,
      price: productToUpdate.price ?? productCached.price,
      image_url: productToUpdate.image_url ?? productCached.image_url,
      product_link: productToUpdate.product_link ?? productCached.product_link,
    };
  }

  async getProductListPaginated(
    page: number,
    limit: number = 20,
    filters: ProductFilters,
    term?: string,
  ) {
    return await this.listProductsRepository.getListProductPaginated(
      page,
      limit,
      term!,
      filters,
    );
  }

  async getProductByName(productName: string) {
    return await this.listProductsRepository.getProductByName(productName);
  }
  async getProductByTerm(term: string) {
    return await this.listProductsRepository.getProductByTerm(term);
  }

  async getShopByName(shopName: string) {
    return await this.productRepository.getProductShopByName(shopName);
  }

  filterLinkWebsites() {
    const linkedWebsites = this.#websiteConfig.filter(
      (website) => website.linkUrl.isRequired,
    );

    return linkedWebsites;
  }
}
