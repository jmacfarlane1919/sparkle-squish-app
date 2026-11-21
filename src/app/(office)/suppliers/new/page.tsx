import { BackLink, Field, Notice, PageIntro } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSupplier } from "@/server/actions/purchasing";

export const metadata = { title: "New supplier" };

export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <BackLink href="/suppliers">Suppliers</BackLink>
      <PageIntro title="New supplier" />
      <Notice error={params.error} />
      <form action={createSupplier} className="space-y-3 rounded-[22px] bg-white p-4">
        <Field label="Name"><Input name="name" required /></Field>
        <Field label="Contact"><Input name="contactName" /></Field>
        <Field label="Email"><Input name="email" type="email" /></Field>
        <Field label="Phone"><Input name="phone" /></Field>
        <Field label="Notes"><Textarea name="notes" /></Field>
        <Button type="submit">Save supplier</Button>
      </form>
    </div>
  );
}
