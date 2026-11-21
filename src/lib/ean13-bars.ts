import { isValidEan13 } from "@/lib/identifiers";

const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];

const G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];

const R = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];

const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Bits(code: string) {
  if (!isValidEan13(code)) throw new Error("A label needs a valid EAN-13 barcode.");
  const digits = code.split("").map(Number);
  const parity = PARITY[digits[0]];
  let bits = "101";
  for (let index = 1; index <= 6; index += 1) {
    const digit = digits[index];
    bits += parity[index - 1] === "L" ? L[digit] : G[digit];
  }
  bits += "01010";
  for (let index = 7; index <= 12; index += 1) {
    bits += R[digits[index]];
  }
  bits += "101";
  return bits;
}
