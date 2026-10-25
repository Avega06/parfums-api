import {
  ParfumInput,
  upsertParfum,
} from "@modules/products/configs/seed-parfums";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  console.log("🌱 Cargando archivo JSON para el seed...");

  // Busca 'parfum-matched.json'
  const filePath = join(process.cwd(), "api/datasets/parfum-matched.json");

  try {
    const fileData = await readFile(filePath, "utf-8");
    const parfumsToSeed: ParfumInput[] = JSON.parse(fileData);

    console.log(
      `📦 Se encontraron ${parfumsToSeed.length} perfumes en el archivo.`,
    );

    let successCount = 0;
    let errorCount = 0;

    for (const [index, item] of parfumsToSeed.entries()) {
      try {
        await upsertParfum(item);
        console.log(
          `[${index + 1}/${parfumsToSeed.length}] ✓ Procesado: ${item.name}`,
        );
        successCount++;
      } catch (err) {
        console.error(
          `[${index + 1}/${parfumsToSeed.length}] ❌ Error en "${item.name}":`,
          err,
        );
        errorCount++;
      }
    }

    console.log(
      `\n✨ Proceso terminado. Exitosos: ${successCount} | Fallidos: ${errorCount}`,
    );
    process.exit(0);
  } catch (err) {
    console.error("❌ Error al leer o procesar el archivo JSON:", err);
    process.exit(1);
  }
}

main();
