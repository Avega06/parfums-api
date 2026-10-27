import { eq } from "drizzle-orm";
import { db } from "api/db";
import { vParfumsFragrantica } from "@db/schema";

export class SpecsProductRepository {
  async getProductSpecs(productId: string) {
    const result = await db
      .select({
        parfumId: vParfumsFragrantica.parfumId,
        parfumName: vParfumsFragrantica.parfumName,
        specs: vParfumsFragrantica.fragrantica,
      })
      .from(vParfumsFragrantica)
      .where(eq(vParfumsFragrantica.parfumId, productId))
      .get();

    if (!result || !result.specs) return null;

    return {
      parfumId: result.parfumId,
      name: result.parfumName,
      specId: result.specs.id,
      year: result.specs.year,
      gender: result.specs.gender,
    };
  }
}
