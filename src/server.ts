import { Hono } from "hono";

import { getClientConnection } from "@adapters/redis.adapter";
import { logger } from "hono/logger";
import { parfumsController } from "@modules/products/controllers";
import { scrapperController } from "@modules/scrapper/controllers";
import { cors } from "hono/cors";

const port = Bun.env.PORT ?? 3000;
const app = new Hono();

app.use(
  "*",
  cors({
    origin: "http://localhost:4200",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

const apiRoutes = new Hono();

apiRoutes.route("/api/parfums", parfumsController);
apiRoutes.route("/api/scrapper", scrapperController);

app.route("/", apiRoutes);

app.use(logger());

export const customLogger = (message: string, ...rest: string[]) => {
  console.error(message, ...rest);
};
app.use(logger(customLogger));

getClientConnection()
  .then(() => console.log("Redis connected"))
  .catch((err) => console.error("Error to connect with Redis:", err));

console.log("Server listen on port", port);

Bun.serve({
  fetch: app.fetch, // Pasa el handler de Hono
  port: port, // Puerto en el que se ejecuta el servidor
  idleTimeout: 255, // Incrementa el tiempo de espera inactivo a 30 segundos (30000 ms)
  maxRequestBodySize: 50_000_000,
});
