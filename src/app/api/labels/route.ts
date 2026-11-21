import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { renderLabels } from "@/lib/labels";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in required.", { status: 401 });
  const ids = new URL(request.url).searchParams.getAll("id");
  const variants = await prisma.variant.findMany({
    where: { id: { in: ids }, ssBarcode: { not: "" } },
    include: { product: true },
  });
  const pdf = await renderLabels(
    variants.map((variant) => ({
      title: variant.title === "Default" ? variant.product.title : `${variant.product.title} ${variant.title}`,
      price: formatMoney(variant.priceCents),
      sku: variant.ssSku,
      barcode: variant.ssBarcode,
    })),
  );
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=ss-labels.pdf",
    },
  });
}
