import { ShopInfoRepository } from "../repositories";

export class ShopService {
  constructor(private shopInfoRepository: ShopInfoRepository) {}

  async getShopInfoByName(name: string) {
    return await this.shopInfoRepository.getShopInfoByName(name);
  }
}
