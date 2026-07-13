import { buildApp, dependenciesFromEnvironment } from "./app.js";

const dependencies = await dependenciesFromEnvironment();
const app = await buildApp(dependencies);
const port = Number(process.env.PORT ?? 4000);
await app.listen({ host: "0.0.0.0", port });

const shutdown = async () => {
  await app.close();
  await dependencies.close?.();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
