import { chromium, Page } from "playwright";
import { scrapperModel } from "./scrapping.model";
import { ScrapingConfig } from "../interfaces";

// Tipos auxiliares
type ProductData = Record<string, string>;
type ExtractOptions = {
  timeoutMs?: number;
};

export const scrappData = async () => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      controller.enqueue(encoder.encode('{"products": ['));
      const { browser, page } = await initScrapper();

      try {
        let isFirst = true;

        for (const config of scrapperModel.scraping_config) {
          console.log(`Iniciando extracción de: ${config.website_name}`);

          try {
            await page.goto(config.website_url, {
              waitUntil: "load",
              timeout: 30000,
            });

            // Manejar popup si está configurado
            await handlePopup(page, config);

            // Verificar si el selector principal existe
            if (!(await selectorExists(page, config.elementList.selector))) {
              console.error(
                `❌ Selector no encontrado: ${config.elementList.selector}`
              );
              continue;
            }

            // Extraer productos según configuración
            const products = config.pagination.enabled
              ? await extractWithPagination(page, config)
              : await extractWithScroll(page, config);

            // Enviar productos al stream
            for (const product of products) {
              if (!isFirst) {
                controller.enqueue(encoder.encode(","));
              } else {
                isFirst = false;
              }
              controller.enqueue(encoder.encode(JSON.stringify(product)));
            }

            console.log(
              `Completada extracción de: ${config.website_name}, ${products.length} productos`
            );
          } catch (error) {
            console.error(`Error procesando ${config.website_name}: ${error}`);
            // Continuar con la siguiente configuración
          }
        }
      } finally {
        await browser.close();
        controller.enqueue(encoder.encode("]}"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    },
  });
};

const initScrapper = async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: scrapperModel.global_settings.user_agent,
  });
  const page = await context.newPage();

  return { browser, page, context };
};

// Funciones de utilidad
const selectorExists = async (
  page: Page,
  selector: string
): Promise<boolean> => {
  const exists = await page.$(selector);
  return !!exists;
};

const handlePopup = async (
  page: Page,
  config: ScrapingConfig
): Promise<void> => {
  if (!config.popup?.enabled) return;

  try {
    const boton = await page.waitForSelector(
      config.popup.button_close_selector!,
      { timeout: 5000 }
    );
    await boton.click();
    console.log("Popup cerrado exitosamente");
  } catch (error) {
    console.log("No se encontró popup o ya fue cerrado");
  }
};

// Función central para extraer productos
const extractProducts = async (
  page: Page,
  config: ScrapingConfig,
  selector: string,
  options: ExtractOptions = {}
): Promise<ProductData[]> => {
  const { target_elements, website_name } = config;
  const { timeoutMs = 1500000 } = options;

  try {
    // Implementar timeout para la extracción
    const extractPromise = page.$$eval(
      selector,
      (elements, params) => {
        const { target_elements, website_name } = params;

        return elements.map((element) => {
          const extractedData: Record<string, string> = { shop: website_name };

          try {
            for (const {
              attribute,
              element_name,
              selector,
            } of target_elements) {
              try {
                const targetElement = element.querySelector(selector);

                if (!targetElement) {
                  extractedData[element_name] = "N/A";
                  continue;
                }

                switch (attribute) {
                  case "src":
                    extractedData[element_name] =
                      targetElement.getAttribute("src") ||
                      targetElement.getAttribute("srcset") ||
                      targetElement.getAttribute("data-src") ||
                      "N/A";
                    break;
                  case "href":
                    extractedData[element_name] =
                      targetElement.getAttribute("href") || "N/A";
                    break;
                  case "price":
                    const priceText = targetElement.textContent?.trim();
                    extractedData[element_name] = priceText ?? "0";
                    break;
                  default:
                    let text = "";
                    if (targetElement.textContent) {
                      text = targetElement.textContent.trim();
                    }
                    extractedData[element_name] = text || "N/A";
                    break;
                }
              } catch (error) {
                extractedData[element_name] = "Error";
              }
            }

            // Establecer type_parfum si está disponible product
            if (extractedData["product"]) {
              extractedData["type_parfum"] = (() => {
                const lowerText = extractedData["product"].toLowerCase();
                if (lowerText.includes("edt")) return "EDT";
                if (lowerText.includes("edp")) return "EDP";
                if (lowerText.includes("eop")) return "EOP";
                if (lowerText.includes("edc")) return "EDC";
                return "Other";
              })();
            } else {
              extractedData["type_parfum"] = "N/A";
            }
          } catch (error) {
            extractedData.error = "Error procesando elemento";
          }

          return extractedData;
        });
      },
      { target_elements, website_name }
    );

    // Aplicar timeout
    const timeoutPromise = new Promise<ProductData[]>((resolve) => {
      setTimeout(() => {
        console.log(`Timeout de extracción alcanzado (${timeoutMs}ms)`);
        resolve([]);
      }, timeoutMs);
    });

    // Devolver lo que termine primero
    const products = await Promise.race([extractPromise, timeoutPromise]);
    const uniqueProducts = validatedDuplicateProducts(products);
    return uniqueProducts;
  } catch (error) {
    console.error(`Error en extractProducts: ${error}`);
    return [];
  }
};

const validatedDuplicateProducts = (products: ProductData[]) => {
  const seen = new Set<string>();
  const uniqueProducts = [];

  for (const product of products || []) {
    const key = `${product.product?.toLowerCase() || "unknown"}|${
      product.shop
    }`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueProducts.push(product);
    }
  }

  return uniqueProducts || [];
};

// Estrategia 1: Extracción con paginación
const extractWithPagination = async (
  page: Page,
  config: ScrapingConfig
): Promise<ProductData[]> => {
  let allProducts: ProductData[] = [];
  const { elementList, pagination } = config;
  const maxPages = pagination.max_pages || 1;

  console.log(`Extrayendo datos de ${maxPages} páginas`);

  try {
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      console.log(`Procesando página ${pageNumber} de ${maxPages}`);

      // Esperar a que los elementos estén disponibles
      await page
        .waitForSelector(elementList.selector, { timeout: 10000 })
        .catch((e) =>
          console.log(
            `Advertencia: timeout esperando selector en página ${pageNumber}`
          )
        );

      // Extraer productos de la página actual
      const products = await extractProducts(
        page,
        config,
        elementList.selector,
        {
          timeoutMs: 15000,
        }
      );

      if (products.length === 0) {
        console.log(
          `No se encontraron productos en la página ${pageNumber} o timeout alcanzado`
        );
      } else {
        console.log(
          `Extraídos ${products.length} productos de la página ${pageNumber}`
        );
        allProducts = allProducts.concat(products);
      }

      // Si hay más páginas, navegar a la siguiente
      if (pageNumber < maxPages) {
        try {
          const nextButton = await page.waitForSelector(
            pagination.next_page_selector!,
            { timeout: 5000 }
          );
          await Promise.all([
            page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
            nextButton.click(),
          ]);
          await page.waitForTimeout(2000); // Esperar a que la página se cargue
        } catch (error) {
          console.log(
            `No se pudo navegar a la página ${
              pageNumber + 1
            }, finalizando paginación`
          );
          break;
        }
      }
    }

    console.log(
      `Extracción con paginación completada. Total: ${allProducts.length} productos`
    );
    return allProducts;
  } catch (error) {
    console.error(`Error en extractWithPagination: ${error}`);
    return allProducts; // Devolver los productos extraídos hasta el momento del error
  }
};

// Estrategia 2: Extracción con scroll infinito
const extractWithScroll = async (
  page: Page,
  config: ScrapingConfig
): Promise<ProductData[]> => {
  console.log("Iniciando extracción por scroll mejorado");

  const { elementList } = config;
  const maxAttempts = 175; // Máximo de scrolls para evitar bucles infinitos
  const waitAfterScroll = 1000; // Tiempo entre scrolls
  const stabilizationChecks = 5; // Número de cheques sin cambios antes de detenerse
  const stabilizationDelay = 1700; // Esperar después de scroll para ver si cargaron productos nuevos

  let lastCount = 0;
  let sameCountTimes = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Scroll intento #${attempt}`);

    // Scroll al fondo
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    await page.waitForTimeout(waitAfterScroll);

    // Contar productos después de scroll
    const currentCount = await page.$$eval(
      elementList.selector,
      (elements) => elements.length
    );

    console.log(`Productos detectados: ${currentCount}`);

    if (currentCount === lastCount) {
      sameCountTimes++;
      console.log(
        `No hay nuevos productos: ${sameCountTimes}/${stabilizationChecks}`
      );

      if (sameCountTimes >= stabilizationChecks) {
        console.log("Scroll estabilizado, no hay más productos nuevos.");
        break;
      }
    } else {
      sameCountTimes = 0; // Resetear contador si encontramos más productos
    }

    lastCount = currentCount;

    // Opcional: scroll directo al último producto visible cada X intentos para forzar carga de nuevos
    if (attempt % 6 === 0) {
      try {
        await page.evaluate((selector) => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements[elements.length - 1].scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
        }, elementList.selector);
        await page.waitForTimeout(stabilizationDelay);
      } catch (error) {
        console.log("Error intentando hacer scroll al último producto:", error);
      }
    }
  }

  // Extraer finalmente todos los productos cargados
  const products = await extractProducts(page, config, elementList.selector, {
    timeoutMs: 30000,
  });

  console.log(`Total productos extraídos: ${products.length}`);
  return products;
};

// Método de recuperación: divide el trabajo en segmentos manejables
const extractInSegments = async (
  page: Page,
  config: ScrapingConfig,
  estimatedTotal?: number
): Promise<ProductData[]> => {
  const { elementList } = config;
  let allProducts: ProductData[] = [];

  try {
    // Determinar cuántos elementos hay que procesar
    let elementsCount = estimatedTotal;

    if (!elementsCount) {
      elementsCount = await page
        .$$eval(elementList.selector, (elements) => elements.length)
        .catch(() => 0);
    }

    if (elementsCount === 0) {
      console.log("No se detectaron elementos para extracción por segmentos");
      return [];
    }

    console.log(`Extrayendo ${elementsCount} productos en segmentos`);

    // Calcular segmentos óptimos según la cantidad total
    // Más segmentos pequeños para grandes cantidades de datos
    const segmentSize =
      elementsCount > 500 ? 50 : elementsCount > 200 ? 25 : 10;

    // Procesar por segmentos
    for (let offset = 0; offset < elementsCount; offset += segmentSize) {
      try {
        const currentSize = Math.min(segmentSize, elementsCount - offset);
        const endIndex = offset + currentSize;

        console.log(
          `Procesando segmento ${offset + 1}-${endIndex} de ${elementsCount}`
        );

        // Construir selector específico para este segmento
        const segmentSelector = `${elementList.selector}:nth-child(n+${
          offset + 1
        }):nth-child(-n+${endIndex})`;

        // Extraer este segmento con timeout adaptativo según tamaño
        const segmentTimeout = Math.min(
          Math.max(currentSize * 200, 3000),
          15000
        );
        const segmentProducts = await extractProducts(
          page,
          config,
          segmentSelector,
          {
            timeoutMs: segmentTimeout,
          }
        );

        if (segmentProducts.length > 0) {
          console.log(
            `Extraídos ${segmentProducts.length} productos del segmento`
          );
          allProducts = allProducts.concat(segmentProducts);
        } else {
          console.log(
            `No se pudieron extraer productos del segmento ${
              offset + 1
            }-${endIndex}`
          );
        }

        // Pequeña pausa entre segmentos
        await page.waitForTimeout(100);
      } catch (error) {
        console.log(`Error en segmento ${offset}: ${error}`);
        continue; // Continuar con el siguiente segmento
      }
    }

    console.log(
      `Extracción por segmentos completada. Total: ${allProducts.length} productos`
    );
    return allProducts;
  } catch (error) {
    console.error(`Error en extractInSegments: ${error}`);
    return allProducts; // Devolver lo que se haya logrado extraer
  }
};
