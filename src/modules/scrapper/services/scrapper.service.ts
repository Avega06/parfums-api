import { Context } from "hono";
import { scrappData } from "../configs";

export class ScrapperService {
  async initScrapping(c: Context) {
    const response = await scrappData();

    return response;
  }
}
