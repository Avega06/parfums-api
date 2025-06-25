import { Hono } from "hono";
import { ScrapperService } from "../services";

const scraperService = new ScrapperService();

export const scrapperController = new Hono();

scrapperController.get("/", async (c) => {
  const response = await scraperService.initScrapping(c);
  return response;
});
