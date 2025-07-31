import { eq } from "drizzle-orm";
import { db } from "api/db";
import { shopInfoView } from "@db/schema";

export class ShopInfoRepository {
  async getShopInfoByName(name: string) {
    return await db
      .select()
      .from(shopInfoView)
      .where(eq(shopInfoView.name, name));
  }
}
