import { describe, expect, it } from "vitest";
import { ean13Bits } from "@/lib/ean13-bars";
import {
  LAST_ISSUED_BARCODE,
  NEXT_FREE_BARCODE,
  allocateBarcode,
  allocateProductSku,
  allocateUniqueSku,
  ean13CheckDigit,
  isValidEan13,
  nextEan13,
} from "@/lib/identifiers";

describe("S&S barcodes", () => {
  it("checks the EAN-13 digit, including a known retail code", () => {
    expect(isValidEan13(LAST_ISSUED_BARCODE)).toBe(true);
    expect(isValidEan13(NEXT_FREE_BARCODE)).toBe(true);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("2000000003468")).toBe(false);
    expect(ean13CheckDigit("200000000346")).toBe(7);
    expect(ean13CheckDigit("200000000347")).toBe(4);
  });

  it("continues the in-store series and never reuses a code", () => {
    expect(nextEan13(LAST_ISSUED_BARCODE)).toBe(NEXT_FREE_BARCODE);
    expect(nextEan13(NEXT_FREE_BARCODE)).toBe("2000000003481");
    expect(allocateBarcode(LAST_ISSUED_BARCODE, [])).toBe(NEXT_FREE_BARCODE);
    expect(allocateBarcode(LAST_ISSUED_BARCODE, new Set([NEXT_FREE_BARCODE]))).toBe("2000000003481");
    expect(allocateBarcode(NEXT_FREE_BARCODE, [])).toBe("2000000003481");
    expect(allocateBarcode(LAST_ISSUED_BARCODE, new Set(["2000000003005"]))).toBe(NEXT_FREE_BARCODE);
  });

  it("refuses to continue from a bad code", () => {
    expect(() => nextEan13("2000000003468")).toThrow(/invalid/i);
  });

  it("draws a 95-module EAN-13 for the next free code", () => {
    const bits = ean13Bits(NEXT_FREE_BARCODE);
    expect(bits).toHaveLength(95);
    expect(bits.startsWith("101")).toBe(true);
    expect(bits.endsWith("101")).toBe(true);
  });
});

describe("S&S SKUs", () => {
  it("starts a category at 001 and keeps going past the highest number", () => {
    expect(allocateProductSku("sq", [])).toBe("SS-SQ-001-STD");
    expect(allocateProductSku("SQ", ["SS-SQ-043-STD", "SS-SQ-111-STD", "SS-SQ-111-STD-1"])).toBe("SS-SQ-112-STD");
  });

  it("adds a numeric copy instead of reusing a SKU", () => {
    expect(allocateUniqueSku("SQ", 111, "std", ["SS-SQ-111-STD"])).toBe("SS-SQ-111-STD-1");
    expect(allocateUniqueSku("SQ", 111, "STD", ["SS-SQ-111-STD", "SS-SQ-111-STD-1"])).toBe("SS-SQ-111-STD-2");
    expect(allocateUniqueSku("SQ", 111, "MINI", ["SS-SQ-111-STD"])).toBe("SS-SQ-111-MINI");
  });
});
