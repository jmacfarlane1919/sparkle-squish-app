import Link from "next/link";
import { PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { products: true, purchaseOrders: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="mx-auto max-w-xl">
      <PageIntro title="Suppliers" subtitle="Contacts, invoices, and purchased items." action={<Link href="/suppliers/new"><Button>New</Button></Link>} />
      <div className="space-y-3">
        {suppliers.map((supplier) => (
          <Link key={supplier.id} href={`/suppliers/${supplier.id}`} className="block rounded-[22px] bg-white p-4">
            <p className="font-extrabold text-[#2f6fe0]">{supplier.name}</p>
            <p className="text-sm text-[#8a8496]">{supplier.contactName || "No contact yet"}</p>
            <p className="mt-1 text-xs text-[#8a8496]">{supplier._count.products} products · {supplier._count.purchaseOrders} purchase orders</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
