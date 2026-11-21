import { FEATURES } from "@/lib/features";
import { chicagoDateKey, chicagoDateTime, shiftDateKey } from "@/lib/format";
import { LAST_ISSUED_BARCODE, ean13FromBody } from "@/lib/identifiers";
import { shopifyConfigured } from "@/lib/env";
import { prisma } from "@/lib/db";
import { saveBytes } from "@/lib/storage";

type DemoVariant = {
  sku: string;
  code: string;
  title: string;
  vendorSku: string;
  vendorBarcode: string;
  offset: number;
  price: number;
  cost: number | null;
  online: number;
  pos: number;
};

type DemoProduct = {
  title: string;
  category: string;
  supplier: string;
  brand: string;
  texture: string;
  season: string;
  size: string;
  material: string;
  age: string;
  description: string;
  status?: string;
  newArrival?: boolean;
  photo?: boolean;
  variants: DemoVariant[];
};

function variant(
  sku: string,
  vendorSku: string,
  vendorBarcode: string,
  offset: number,
  price: number,
  cost: number | null,
  online: number,
  pos: number,
  code = "STD",
  title = "Default",
): DemoVariant {
  return { sku, code, title, vendorSku, vendorBarcode, offset, price, cost, online, pos };
}

const catalog: DemoProduct[] = [
  {
    title: "Peach Mochi Bear",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "mochi",
    season: "spring",
    size: "palm",
    material: "TPE",
    age: "3+",
    description: "A slow-rising peach bear that lives by the register.",
    photo: true,
    variants: [variant("SS-SQ-043-STD", "MOCHI-BEAR-PCH", "810045551203", 1, 1400, 525, 6, 18)],
  },
  {
    title: "Cloud Dumpling",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "cloud",
    season: "all",
    size: "palm",
    material: "TPE",
    age: "3+",
    description: "A plump dumpling squishy, with a mini that shares the same product number.",
    newArrival: true,
    photo: true,
    variants: [
      variant("SS-SQ-111-STD", "CLOUD-DUMP-STD", "810045551210", 2, 1600, 640, 4, 8),
      variant("SS-SQ-111-STD-1", "CLOUD-DUMP-MINI", "810045551227", 3, 1200, 480, 3, 6, "STD", "Mini"),
    ],
  },
  {
    title: "Lavender Loaf",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "bread",
    season: "all",
    size: "palm",
    material: "polyurethane",
    age: "3+",
    description: "A lavender loaf with a soft crust and a slow rise.",
    photo: true,
    variants: [variant("SS-SQ-014-STD", "LAV-LOAF", "735328847102", 4, 1500, 575, 5, 11)],
  },
  {
    title: "Loaf Sample",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "bread",
    season: "all",
    size: "mini",
    material: "polyurethane",
    age: "3+",
    description: "A leftover sample that was entered twice in the old prototype. Same S&S SKU as Lavender Loaf.",
    status: "draft",
    variants: [variant("SS-SQ-014-STD", "LAV-LOAF-SAMPLE", "735328847119", 5, 1500, null, 0, 1)],
  },
  {
    title: "Berry Stack",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "stacked",
    season: "summer",
    size: "palm",
    material: "TPE",
    age: "3+",
    description: "Three berry layers stacked into one squish.",
    photo: true,
    variants: [variant("SS-SQ-028-STD", "BERRY-STACK", "735328847126", 6, 1800, 710, 4, 9)],
  },
  {
    title: "Mint Macaron",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "mochi",
    season: "spring",
    size: "small",
    material: "TPE",
    age: "3+",
    description: "A mint macaron with no cost on file yet.",
    variants: [variant("SS-SQ-007-STD", "MINT-MAC", "735328847133", 7, 1100, null, 2, 7)],
  },
  {
    title: "Butter Bun",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "bread",
    season: "all",
    size: "palm",
    material: "TPE",
    age: "3+",
    description: "A butter bun. Its S&S barcode was typed twice and also sits on Crystal Crunch.",
    variants: [variant("SS-SQ-052-STD", "BUTTER-BUN", "735328847140", 12, 1300, 490, 3, 10)],
  },
  {
    title: "Lemon Mochi",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "mochi",
    season: "summer",
    size: "palm",
    material: "TPE",
    age: "3+",
    description: "A bright lemon mochi from the same tray as the peach bear.",
    photo: true,
    variants: [variant("SS-SQ-044-STD", "LEMON-MOCHI", "810045551234", 21, 1400, 530, 5, 12)],
  },
  {
    title: "Blueberry Dumpling",
    category: "SQ",
    supplier: "Mochi Lane",
    brand: "Mochi Lane",
    texture: "mochi",
    season: "summer",
    size: "palm",
    material: "TPE",
    age: "3+",
    description: "A blueberry dumpling that sits next to Cloud Dumpling.",
    variants: [variant("SS-SQ-061-STD", "BLUE-DUMP", "810045551241", 22, 1500, 560, 2, 8)],
  },
  {
    title: "Night Market Fox",
    category: "SQ",
    supplier: "Soft Seasonals",
    brand: "Soft Seasonals",
    texture: "velvet",
    season: "fall",
    size: "palm",
    material: "polyurethane",
    age: "5+",
    description: "A new fox that is on order and has not been checked in.",
    newArrival: true,
    variants: [variant("SS-SQ-096-STD", "FOX-NIGHT", "810045559001", 18, 1700, 680, 0, 0)],
  },
  {
    title: "Clicky Key",
    category: "FG",
    supplier: "Fidget Foundry",
    brand: "Fidget Foundry",
    texture: "click",
    season: "all",
    size: "keychain",
    material: "zinc",
    age: "6+",
    description: "A quiet-enough key clicker for the counter dish.",
    photo: true,
    variants: [variant("SS-FG-021-STD", "CLICK-KEY", "860221100218", 9, 900, 275, 14, 22)],
  },
  {
    title: "Orbit Clicker",
    category: "FG",
    supplier: "Fidget Foundry",
    brand: "Fidget Foundry",
    texture: "click",
    season: "all",
    size: "pocket",
    material: "plastic",
    age: "6+",
    description: "A round clicker with a soft orbit.",
    variants: [variant("SS-FG-033-STD", "ORBIT-CLK", "860221100225", 10, 1200, 360, 6, 9)],
  },
  {
    title: "Marble Mesh",
    category: "FG",
    supplier: "Fidget Foundry",
    brand: "Fidget Foundry",
    texture: "mesh",
    season: "all",
    size: "pocket",
    material: "steel",
    age: "8+",
    description: "A marble in a mesh. The cost was never entered.",
    variants: [variant("SS-FG-008-STD", "MARBLE-MESH", "860221100232", 11, 800, null, 4, 5)],
  },
  {
    title: "Pebble Click",
    category: "FG",
    supplier: "Fidget Foundry",
    brand: "Fidget Foundry",
    texture: "click",
    season: "all",
    size: "pocket",
    material: "resin",
    age: "6+",
    description: "A pebble-shaped clicker in the dish by the door.",
    variants: [variant("SS-FG-012-STD", "PEBBLE-CLK", "860221100249", 23, 700, 210, 11, 16)],
  },
  {
    title: "Switch Pop",
    category: "FG",
    supplier: "Fidget Foundry",
    brand: "Fidget Foundry",
    texture: "pop",
    season: "all",
    size: "pocket",
    material: "plastic",
    age: "5+",
    description: "A single switch pop with a firm click.",
    variants: [variant("SS-FG-018-STD", "SWITCH-POP", "860221100256", 24, 600, 180, 8, 14)],
  },
  {
    title: "Soda Cap Fidget",
    category: "FG",
    supplier: "Fidget Foundry",
    brand: "Fidget Foundry",
    texture: "click",
    season: "summer",
    size: "cap",
    material: "plastic",
    age: "6+",
    description: "A new soda-cap clicker that is still on the purchase order.",
    newArrival: true,
    variants: [variant("SS-FG-044-STD", "SODA-CAP", "860221100263", 19, 600, 180, 0, 0)],
  },
  {
    title: "Galaxy Pour",
    category: "SL",
    supplier: "Slime Studio Co",
    brand: "Slime Studio",
    texture: "gloss",
    season: "all",
    size: "cup",
    material: "glue base",
    age: "6+",
    description: "A glossy galaxy pour in a clear cup.",
    photo: true,
    variants: [variant("SS-SL-019-STD", "GALAXY-POUR", "912200441190", 13, 1000, 325, 7, 15)],
  },
  {
    title: "Butter Slime Cup",
    category: "SL",
    supplier: "Slime Studio Co",
    brand: "Slime Studio",
    texture: "butter",
    season: "all",
    size: "cup",
    material: "glue base",
    age: "6+",
    description: "A spreadable butter slime.",
    variants: [variant("SS-SL-004-STD", "BUTTER-SLIME", "912200441206", 14, 900, 290, 5, 12)],
  },
  {
    title: "Crystal Crunch",
    category: "SL",
    supplier: "Slime Studio Co",
    brand: "Slime Studio",
    texture: "crunch",
    season: "all",
    size: "cup",
    material: "glue base",
    age: "8+",
    description: "A crunchy clear slime. The barcode on this cup was copied from Butter Bun.",
    variants: [variant("SS-SL-027-STD", "CRYSTAL-CRUNCH", "912200441213", 12, 1100, 340, 4, 8)],
  },
  {
    title: "Cloud Slime",
    category: "SL",
    supplier: "Slime Studio Co",
    brand: "Slime Studio",
    texture: "cloud",
    season: "all",
    size: "cup",
    material: "glue base",
    age: "6+",
    description: "A fluffy cloud slime that inflates when you stretch it.",
    variants: [variant("SS-SL-012-STD", "CLOUD-SLIME", "912200441220", 25, 1000, 310, 6, 10)],
  },
  {
    title: "Confetti Cup",
    category: "SL",
    supplier: "Slime Studio Co",
    brand: "Slime Studio",
    texture: "crunch",
    season: "party",
    size: "cup",
    material: "glue base",
    age: "6+",
    description: "Clear slime with a handful of confetti.",
    variants: [variant("SS-SL-022-STD", "CONFETTI-CUP", "912200441237", 26, 1000, 320, 3, 9)],
  },
  {
    title: "Rainy Day Slime",
    category: "SL",
    supplier: "Soft Seasonals",
    brand: "Soft Seasonals",
    texture: "gloss",
    season: "fall",
    size: "cup",
    material: "glue base",
    age: "6+",
    description: "A grey-blue slime on the seasonal order. It has not arrived.",
    newArrival: true,
    variants: [variant("SS-SL-031-STD", "RAIN-SLIME", "912200449901", 20, 1000, 310, 0, 0)],
  },
  {
    title: "Quiet Cube",
    category: "CY",
    supplier: "Soft Seasonals",
    brand: "Soft Seasonals",
    texture: "smooth",
    season: "all",
    size: "cube",
    material: "silicone",
    age: "3+",
    description: "A quiet cube. The CY category name can be spelled out in Settings.",
    photo: true,
    variants: [variant("SS-CY-003-STD", "QUIET-CUBE", "700123450038", 16, 1600, 600, 2, 6)],
  },
  {
    title: "Soft Prism",
    category: "CY",
    supplier: "Soft Seasonals",
    brand: "Soft Seasonals",
    texture: "smooth",
    season: "all",
    size: "palm",
    material: "silicone",
    age: "3+",
    description: "A soft prism that catches the window light.",
    variants: [variant("SS-CY-008-STD", "SOFT-PRISM", "700123450045", 27, 1400, 520, 2, 4)],
  },
  {
    title: "Glow Marble",
    category: "GM",
    supplier: "Neon Noodle Supply",
    brand: "Neon Noodle",
    texture: "glass",
    season: "all",
    size: "marble",
    material: "glass",
    age: "8+",
    description: "A glow marble kept in the draft order.",
    variants: [variant("SS-GM-011-STD", "GLOW-MARBLE", "640998110112", 17, 700, 210, 9, 4)],
  },
  {
    title: "Pocket Marble",
    category: "GM",
    supplier: "Neon Noodle Supply",
    brand: "Neon Noodle",
    texture: "glass",
    season: "all",
    size: "marble",
    material: "glass",
    age: "8+",
    description: "A pocket marble on the same draft as Glow Marble.",
    variants: [variant("SS-GM-004-STD", "POCKET-MARBLE", "640998110129", 28, 500, 160, 12, 7)],
  },
  {
    title: "Sparkle Putty",
    category: "SP",
    supplier: "Neon Noodle Supply",
    brand: "Neon Noodle",
    texture: "putty",
    season: "all",
    size: "tin",
    material: "putty",
    age: "5+",
    description: "Glitter putty in a tin. This one holds the last S&S barcode already in use.",
    variants: [variant("SS-SP-006-STD", "SPARK-PUTTY", "640998110136", 0, 800, 240, 6, 11)],
  },
];

function barcodeForOffset(offset: number) {
  const body = (200000000346n - BigInt(offset)).toString().padStart(12, "0");
  return ean13FromBody(body);
}

function art(title: string, index: number) {
  const pairs = [
    ["#F8D5E4", "#E7DFF8"],
    ["#D4F1EA", "#D9E7FB"],
    ["#FDE4C4", "#F8D5E4"],
    ["#E7DFF8", "#C9E8F8"],
    ["#F0D9F6", "#FDE4C4"],
    ["#D9E7FB", "#E7DFF8"],
    ["#F8D5E4", "#D4F1EA"],
    ["#FDE4C4", "#E7DFF8"],
  ];
  const [from, to] = pairs[index % pairs.length];
  const label = title.split(" ").slice(0, 2).join(" ");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="400" cy="320" r="150" fill="#ffffff" fill-opacity="0.5"/>
  <text x="400" y="530" text-anchor="middle" font-family="Georgia, serif" font-size="52" fill="#2c2640">${label}</text>
</svg>`);
}

let seeding: Promise<void> | null = null;

export function ensureDemoSeed() {
  if (!seeding) {
    seeding = seedIfEmpty().finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

async function seedIfEmpty() {
  if (shopifyConfigured()) return;
  const categories = await prisma.category.count();
  if (categories > 0) return;
  await seedDemo();
}

export async function seedDemo() {
  if (shopifyConfigured() && process.env.SEED_DEMO !== "force") {
    throw new Error("Refusing to load demo data because SHOPIFY_ADMIN_TOKEN is set.");
  }
  await prisma.$transaction([
    prisma.refundLine.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.saleLine.deleteMany(),
    prisma.saleOrder.deleteMany(),
    prisma.inventoryCountLine.deleteMany(),
    prisma.inventoryCount.deleteMany(),
    prisma.receiptLine.deleteMany(),
    prisma.receipt.deleteMany(),
    prisma.purchaseOrderLine.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.stockLevel.deleteMany(),
    prisma.photo.deleteMany(),
    prisma.variant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.location.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.syncRun.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.featureFlag.deleteMany(),
    prisma.category.deleteMany(),
    prisma.barcodeCounter.deleteMany(),
    prisma.appSetting.deleteMany(),
  ]);

  await prisma.featureFlag.createMany({
    data: FEATURES.map((feature) => ({ ...feature, enabled: false })),
  });
  await prisma.category.createMany({
    data: [
      { code: "SQ", name: "Squishy", sortOrder: 1 },
      { code: "FG", name: "Fidget", sortOrder: 2 },
      { code: "SL", name: "Slime", sortOrder: 3 },
      { code: "CY", name: "CY", sortOrder: 4 },
      { code: "GM", name: "GM", sortOrder: 5 },
      { code: "SP", name: "SP", sortOrder: 6 },
    ],
  });
  await prisma.barcodeCounter.create({ data: { id: "series", lastIssued: LAST_ISSUED_BARCODE } });
  await prisma.appSetting.createMany({
    data: [
      { key: "po_next", value: "1058" },
      { key: "timezone", value: "America/Chicago" },
      { key: "currency", value: "USD" },
    ],
  });

  const online = await prisma.location.create({
    data: { name: "Sparkle & Squish online", channel: "online" },
  });
  const pos = await prisma.location.create({
    data: { name: "The Squishy Shop", channel: "pos", isDefaultReceive: true },
  });

  const supplierRows = [
    ["Mochi Lane", "June Park", "june@mochilane.example", "312-555-0148", "Squishies. Invoices come in the box."],
    ["Fidget Foundry", "Andre Ellis", "andre@fidgetfoundry.example", "773-555-0194", "Clickers and pocket fidgets."],
    ["Slime Studio Co", "Priya Shah", "priya@slimestudio.example", "312-555-0177", "Cups are packed on Mondays."],
    ["Soft Seasonals", "Lila Nguyen", "lila@softseasonals.example", "872-555-0112", "Seasonal drops and quiet toys."],
    ["Neon Noodle Supply", "Chris Adeyemi", "chris@neonnoodle.example", "312-555-0160", "Putty, marbles, and glitter."],
  ] as const;
  const suppliers = new Map<string, string>();
  for (const [name, contactName, email, phone, notes] of supplierRows) {
    const supplier = await prisma.supplier.create({ data: { name, contactName, email, phone, notes } });
    suppliers.set(name, supplier.id);
  }

  const variantIds = new Map<string, { id: string; price: number; cost: number | null; title: string; product: string }>();
  for (const [index, item] of catalog.entries()) {
    const onHand = item.variants.reduce((sum, row) => sum + row.online + row.pos, 0);
    const product = await prisma.product.create({
      data: {
        title: item.title,
        description: item.description,
        status: item.status || "active",
        brand: item.brand,
        texture: item.texture,
        season: item.season,
        size: item.size,
        material: item.material,
        ageGuidance: item.age,
        newArrival: Boolean(item.newArrival),
        receivedAt: onHand > 0 ? chicagoDateTime(shiftDateKey(chicagoDateKey(new Date()), -12), 11) : null,
        categoryCode: item.category,
        supplierId: suppliers.get(item.supplier),
      },
    });
    if (item.photo) {
      const key = `photos/${product.id}.svg`;
      await saveBytes(key, art(item.title, index), "image/svg+xml");
      await prisma.photo.create({
        data: {
          productId: product.id,
          role: "original",
          storageKey: key,
          alt: `${item.title} original photo`,
          contentType: "image/svg+xml",
        },
      });
      if (item.title === "Peach Mochi Bear") {
        const brandedKey = `photos/${product.id}-branded.svg`;
        await saveBytes(brandedKey, art(item.title, index), "image/svg+xml");
        await prisma.photo.create({
          data: {
            productId: product.id,
            role: "branded",
            storageKey: brandedKey,
            alt: "Peach Mochi Bear, S&S photo",
            contentType: "image/svg+xml",
          },
        });
      }
    }
    for (const [position, row] of item.variants.entries()) {
      const created = await prisma.variant.create({
        data: {
          productId: product.id,
          title: row.title,
          variantCode: row.code,
          vendorSku: row.vendorSku,
          vendorBarcode: row.vendorBarcode,
          ssSku: row.sku,
          ssBarcode: barcodeForOffset(row.offset),
          priceCents: row.price,
          costCents: row.cost,
          position,
        },
      });
      await prisma.stockLevel.createMany({
        data: [
          { variantId: created.id, locationId: online.id, available: row.online },
          { variantId: created.id, locationId: pos.id, available: row.pos },
        ],
      });
      variantIds.set(row.sku, { id: created.id, price: row.price, cost: row.cost, title: item.title, product: product.id });
    }
  }

  async function createPo(input: {
    number: string;
    supplier: string;
    status: string;
    invoice: string;
    notes: string;
    orderedDaysAgo: number | null;
    lines: { sku: string; ordered: number; received: number; cost: number }[];
    receipt?: { daysAgo: number; note: string; lines: { sku: string; qty: number }[] };
  }) {
    const po = await prisma.purchaseOrder.create({
      data: {
        number: input.number,
        supplierId: suppliers.get(input.supplier) || "",
        locationId: pos.id,
        status: input.status,
        invoiceNumber: input.invoice,
        notes: input.notes,
        orderedAt: input.orderedDaysAgo == null ? null : chicagoDateTime(shiftDateKey(chicagoDateKey(new Date()), -input.orderedDaysAgo), 9),
      },
    });
    const lineIds = new Map<string, string>();
    for (const line of input.lines) {
      const variant = variantIds.get(line.sku);
      if (!variant) throw new Error(`Missing demo SKU ${line.sku}`);
      const created = await prisma.purchaseOrderLine.create({
        data: {
          purchaseOrderId: po.id,
          variantId: variant.id,
          description: variant.title,
          qtyOrdered: line.ordered,
          qtyReceived: line.received,
          unitCostCents: line.cost,
        },
      });
      lineIds.set(line.sku, created.id);
    }
    if (input.receipt) {
      const receipt = await prisma.receipt.create({
        data: {
          purchaseOrderId: po.id,
          receivedAt: chicagoDateTime(shiftDateKey(chicagoDateKey(new Date()), -input.receipt.daysAgo), 15, 30),
          note: input.receipt.note,
          shopifyStatus: "pending",
        },
      });
      for (const line of input.receipt.lines) {
        const variant = variantIds.get(line.sku);
        await prisma.receiptLine.create({
          data: {
            receiptId: receipt.id,
            purchaseOrderLineId: lineIds.get(line.sku) || "",
            variantId: variant?.id,
            qty: line.qty,
            unitCostCents: input.lines.find((row) => row.sku === line.sku)?.cost || 0,
            previousOnHand: 0,
            previousCostCents: null,
            newOnHand: line.qty,
            newCostCents: input.lines.find((row) => row.sku === line.sku)?.cost || 0,
          },
        });
      }
    }
  }

  await createPo({
    number: "PO-1051",
    supplier: "Mochi Lane",
    status: "received",
    invoice: "ML-441",
    notes: "Peach bears for the front table.",
    orderedDaysAgo: 14,
    lines: [{ sku: "SS-SQ-043-STD", ordered: 24, received: 24, cost: 525 }],
    receipt: { daysAgo: 4, note: "All 24 checked in.", lines: [{ sku: "SS-SQ-043-STD", qty: 24 }] },
  });
  await createPo({
    number: "PO-1052",
    supplier: "Slime Studio Co",
    status: "received",
    invoice: "SS-188",
    notes: "",
    orderedDaysAgo: 8,
    lines: [{ sku: "SS-SL-019-STD", ordered: 24, received: 24, cost: 325 }],
    receipt: { daysAgo: 1, note: "Galaxy pour cups.", lines: [{ sku: "SS-SL-019-STD", qty: 24 }] },
  });
  await createPo({
    number: "PO-1053",
    supplier: "Fidget Foundry",
    status: "received",
    invoice: "FF-902",
    notes: "",
    orderedDaysAgo: 9,
    lines: [{ sku: "SS-FG-021-STD", ordered: 40, received: 40, cost: 275 }],
    receipt: { daysAgo: 2, note: "Clicky keys for the dish.", lines: [{ sku: "SS-FG-021-STD", qty: 40 }] },
  });
  await createPo({
    number: "PO-1054",
    supplier: "Mochi Lane",
    status: "partial",
    invoice: "ML-458",
    notes: "Minis are still in the second box.",
    orderedDaysAgo: 3,
    lines: [
      { sku: "SS-SQ-111-STD", ordered: 12, received: 6, cost: 640 },
      { sku: "SS-SQ-111-STD-1", ordered: 12, received: 0, cost: 480 },
    ],
    receipt: { daysAgo: 0, note: "Six standard dumplings. Minis not in this box.", lines: [{ sku: "SS-SQ-111-STD", qty: 6 }] },
  });
  await createPo({
    number: "PO-1055",
    supplier: "Soft Seasonals",
    status: "ordered",
    invoice: "",
    notes: "Fall drop.",
    orderedDaysAgo: 1,
    lines: [
      { sku: "SS-SQ-096-STD", ordered: 18, received: 0, cost: 680 },
      { sku: "SS-SL-031-STD", ordered: 24, received: 0, cost: 310 },
    ],
  });
  await createPo({
    number: "PO-1056",
    supplier: "Fidget Foundry",
    status: "ordered",
    invoice: "",
    notes: "",
    orderedDaysAgo: 1,
    lines: [{ sku: "SS-FG-044-STD", ordered: 36, received: 0, cost: 180 }],
  });
  await createPo({
    number: "PO-1057",
    supplier: "Neon Noodle Supply",
    status: "draft",
    invoice: "",
    notes: "Not sent yet.",
    orderedDaysAgo: null,
    lines: [
      { sku: "SS-GM-011-STD", ordered: 20, received: 0, cost: 210 },
      { sku: "SS-GM-004-STD", ordered: 20, received: 0, cost: 160 },
    ],
  });

  const today = chicagoDateKey(new Date());
  let orderNumber = 4820;
  async function sell(daysAgo: number, hour: number, minute: number, channel: "online" | "pos", sku: string, qty: number) {
    const variant = variantIds.get(sku);
    if (!variant) throw new Error(sku);
    orderNumber += 1;
    return prisma.saleOrder.create({
      data: {
        shopifyOrderId: `demo-${orderNumber}`,
        name: `#${orderNumber}`,
        channel,
        locationName: channel === "pos" ? "The Squishy Shop" : "Online",
        processedAt: chicagoDateTime(shiftDateKey(today, -daysAgo), hour, minute),
        financialStatus: "paid",
        lines: {
          create: [
            {
              shopifyLineId: `demo-line-${orderNumber}`,
              variantId: variant.id,
              title: variant.title,
              sku,
              qty,
              unitPriceCents: variant.price,
              unitCostCents: variant.cost,
            },
          ],
        },
      },
    });
  }

  await sell(0, 10, 15, "pos", "SS-SQ-043-STD", 1);
  await sell(0, 11, 40, "pos", "SS-FG-021-STD", 2);
  await sell(0, 13, 5, "online", "SS-SQ-111-STD", 1);
  await sell(0, 15, 20, "online", "SS-SL-019-STD", 1);

  const berry = await sell(1, 12, 10, "pos", "SS-SQ-028-STD", 1);
  const berryLine = await prisma.saleLine.findFirst({ where: { orderId: berry.id } });
  await prisma.refund.create({
    data: {
      orderId: berry.id,
      shopifyRefundId: "demo-refund-1",
      processedAt: chicagoDateTime(shiftDateKey(today, -1), 16, 5),
      lines: {
        create: [
          {
            variantId: berryLine?.variantId,
            title: "Berry Stack",
            qty: 1,
            amountCents: 1800,
            unitCostCents: 710,
          },
        ],
      },
    },
  });

  const rotation = ["SS-SQ-044-STD", "SS-FG-012-STD", "SS-SL-004-STD", "SS-CY-003-STD", "SS-SP-006-STD", "SS-SQ-061-STD"];
  for (let daysAgo = 2; daysAgo <= 12; daysAgo += 1) {
    const sku = rotation[daysAgo % rotation.length];
    await sell(daysAgo, 11, 5, daysAgo % 2 === 0 ? "pos" : "online", sku, 1);
    await sell(daysAgo, 15, 45, daysAgo % 2 === 0 ? "online" : "pos", rotation[(daysAgo + 2) % rotation.length], 1);
  }

  await prisma.auditLog.create({
    data: {
      feature: "product_basics",
      action: "Sample dry run",
      mode: "blocked",
      summary: "Shopify writes are off. Vendor SKU and barcode fields are never included.",
      payload: JSON.stringify({ note: "Demo audit entry. Real writes land here when a switch is on." }, null, 2),
      result: "Nothing was sent.",
    },
  });
}
