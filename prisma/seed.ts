import { seedDemo } from "../src/server/seed-demo";

seedDemo()
  .then(() => {
    console.log("Demo shop ready.");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
