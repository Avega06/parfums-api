import { Hono } from "hono";

import { getClientConnection } from "api/adapters/redis.adapter";
import { logger } from "hono/logger";
import { parfumsController } from "api/modules/products/controllers";
import { scrapperController } from "api/modules/scrapper/controllers";
import { cors } from "hono/cors";
import { handle } from "hono/vercel";

const port = Bun.env.PORT ?? 3000;
const app = new Hono();
const allowedOrigins = [
  "https://f3ghhw6s-4200.brs.devtunnels.ms",
  "https://parfums-app.onrender.com",
  "http://localhost:4200",
  "http://localhost:5000",
  "http://127.0.0.1:4200",
];

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (!origin) return "*";
      if (allowedOrigins.includes(origin)) {
        return origin; // permitir este origen
      }
      return null; // bloquear otros
    },
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

export default handle(app);

Bun.serve({
  fetch: app.fetch, // Pasa el handler de Hono
  port: port, // Puerto en el que se ejecuta el servidor
  idleTimeout: 255, // Incrementa el tiempo de espera inactivo a 30 segundos (30000 ms)
  maxRequestBodySize: 50_000_000,
});
