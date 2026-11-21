import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}
mkdirSync("data", { recursive: true });
mkdirSync("storage/photos", { recursive: true });
execSync("npx prisma generate", { stdio: "inherit" });
execSync("npx prisma db push", { stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
console.log("S&S Software is ready. Run npm run dev and open http://127.0.0.1:43123");
