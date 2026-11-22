import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const path = "prisma/schema.prisma";
const original = readFileSync(path, "utf8");
const postgres = original
  .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
  .replace(
    /url\s*=\s*env\("DATABASE_URL"\)/,
    'url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")',
  );

if (!postgres.includes('provider = "postgresql"') || !postgres.includes("directUrl")) {
  console.error("Could not switch Prisma to PostgreSQL for the Vercel build.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add the Neon or Vercel Postgres connection string in Vercel.");
  process.exit(1);
}
if (!process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;

writeFileSync(path, postgres);
try {
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  execSync("npx prisma generate", { stdio: "inherit", env: process.env });
} finally {
  if (process.env.VERCEL !== "1") writeFileSync(path, original);
}
