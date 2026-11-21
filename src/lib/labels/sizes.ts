export type LabelSize = {
  id: string;
  label: string;
  width: number;
  height: number;
  kind: "roll" | "sheet";
  columns?: number;
  rows?: number;
  marginX?: number;
  marginY?: number;
  gapX?: number;
  pageWidth?: number;
  pageHeight?: number;
};

const inch = 72;

export const LABEL_SIZES: LabelSize[] = [
  {
    id: "thermal-225",
    label: "Thermal 2.25 × 1.25 in",
    width: 2.25 * inch,
    height: 1.25 * inch,
    kind: "roll",
  },
  {
    id: "thermal-2",
    label: "Thermal 2 × 1 in",
    width: 2 * inch,
    height: 1 * inch,
    kind: "roll",
  },
  {
    id: "avery",
    label: "Avery sheet",
    width: 2.625 * inch,
    height: 1 * inch,
    kind: "sheet",
    columns: 3,
    rows: 10,
    marginX: 0.1875 * inch,
    marginY: 0.5 * inch,
    gapX: 0.125 * inch,
    pageWidth: 8.5 * inch,
    pageHeight: 11 * inch,
  },
];

export function labelSize(id: string) {
  return LABEL_SIZES.find((size) => size.id === id) ?? LABEL_SIZES[2];
}
