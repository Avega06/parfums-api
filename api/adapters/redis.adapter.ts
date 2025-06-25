// import { createClient, RedisClientType } from "redis";

// let client: RedisClientType | null = null;

// export const getClientConnection = async (): Promise<RedisClientType> => {
//   if (client) return client;

//   if (!process.env.REDIS_MODE) {
//     throw new Error("Redis - Mode not found");
//   }

//   if (!process.env.REDIS_HOST_URL_PROD && !process.env.REDIS_LOCAL_HOST) {
//     throw new Error("Redis - URL not found");
//   }

//   client = createClient({
//     url: process.env.REDIS_HOST_URL ?? process.env.REDIS_LOCAL_HOST,
//   });

//   client.on("error", (err) => {
//     console.error("Redis error:", err);
//   });

//   await client.connect();

//   return client;
// };
