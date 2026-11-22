import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashOwnerPassword, productionPasswordAllowed, verifyStoredPassword } from "@/lib/owner";

describe("live owner password", () => {
  it("rejects a blank password and the demo password", () => {
    expect(productionPasswordAllowed("")).toBe(false);
    expect(productionPasswordAllowed("short")).toBe(false);
    expect(productionPasswordAllowed("squish-demo")).toBe(false);
    expect(productionPasswordAllowed("a-real-shop-password")).toBe(true);
  });

  it("checks a stored password without keeping the original", () => {
    const stored = hashOwnerPassword("a-real-shop-password");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(stored).not.toContain("a-real-shop-password");
    expect(verifyStoredPassword("a-real-shop-password", stored)).toBe(true);
    expect(verifyStoredPassword("squish-demo", stored)).toBe(false);
  });

  it("includes a PostgreSQL migration for the live database", () => {
    const lock = readFileSync("prisma/migrations/migration_lock.toml", "utf8");
    const sql = readFileSync("prisma/migrations/20261122031700_init/migration.sql", "utf8");
    expect(lock).toContain('provider = "postgresql"');
    expect(sql).toContain('CREATE TABLE "Invoice"');
    expect(sql).toContain('CREATE TABLE "PurchaseOrder"');
    expect(sql.toLowerCase()).not.toContain("sqlite");
  });
});
