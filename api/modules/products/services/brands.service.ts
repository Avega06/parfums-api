import { cleanText } from "@helpers/string-formatter";
import { Product } from "../interfaces";
import { type BrandsRepository } from "../repositories";

export class BrandsService {
  #brands: Set<string> = new Set();

  constructor(private brandRepository: BrandsRepository) {}

  async getBrandByProduct(product: Product) {
    let brandId: string;

    if (product.brand) {
      const brandResult = await this.brandRepository.getBrandWithName(
        product.brand,
      );

      brandId = brandResult!.brandId;
      return brandId;
    }

    return null;
  }

  async addBrandsByProducts(product: Product) {
    let processedProduct = product;
    if (product.brand) {
      this.setBrands(product.brand);
    } else {
      processedProduct = await this.setBrandsFromProducts(product);
    }

    return processedProduct;
  }

  async setBrands(brand: string) {
    if (this.#brands.has(brand)) return;

    this.#brands.add(brand);
  }

  async saveBrands() {
    try {
      const brandsToInsert = Array.from(this.#brands).map((brand) => ({
        name: brand,
      }));

      await this.brandRepository.insertBrands(brandsToInsert);
    } catch (error) {
      throw new Error(`${error}`);
    }
  }

  async setBrandsFromProducts(parfum: Product) {
    const allBrands = await this.brandRepository.getBrands();
    const { product } = parfum;
    const parenthesisRegex = /\(.*?\)/g;

    const parfumNameCleaned = cleanText(
      product,
      parenthesisRegex,
    ).toLowerCase();

    let earliestIndex = Infinity;
    let selectedBrand: string | null = null;

    allBrands.forEach(({ name }) => {
      const significantWords = name
        .toLowerCase()
        .split(" ")
        .filter((word) => word.length > 3);

      significantWords.forEach((word) => {
        const index = parfumNameCleaned.indexOf(word);
        if (index !== -1 && index < earliestIndex) {
          earliestIndex = index;
          selectedBrand = name;
        }
      });
    });

    if (selectedBrand) {
      parfum.brand = selectedBrand;
    }
    if (!parfum.brand) {
      //customLogger("This products has not a brand, check db:", product);
    }

    return parfum;
  }
}
