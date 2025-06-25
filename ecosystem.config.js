module.exports = {
  apps: [
    {
      name: "parfums-api",
      script: "bun",
      args: "run ./src/server.ts",
      interpreter: "none",
      exec_mode: "fork",
      instances: "1",
      env_dev: {
        NODE_ENV: "development",
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      watch: true, // Reinicia si hay cambios en los archivos
      autorestart: true, // Reinicio automático si falla
    },
  ],
};
