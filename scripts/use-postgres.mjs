import { readFileSync, writeFileSync } from "node:fs";

const path = "prisma/schema.prisma";
const source = readFileSync(path, "utf8");
const next = source.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
if (next === source) {
  console.log("The schema is already set to postgresql, or the provider line was not found.");
  process.exit(0);
}
writeFileSync(path, next);
console.log("Prisma is now set to postgresql.");
console.log("Set DATABASE_URL to your Postgres connection string, then run: npx prisma db push");
