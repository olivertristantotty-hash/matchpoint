import { config } from "dotenv";
config();

async function main() {
  const { scheduler } = await import("./services/scheduler.js");
  await import("./bot/index.js");
  scheduler.start(60_000);
}

main().catch(console.error);
