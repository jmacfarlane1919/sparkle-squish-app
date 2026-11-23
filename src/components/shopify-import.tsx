"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Status = { done: boolean; error?: boolean; message: string; productsDone: number; productsTotal: number | null; stamp?: string };

export function ShopifyImport({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [running, setRunning] = useState(false);

  async function run(fresh: boolean) {
    setRunning(true);
    let guard = 0;
    let previous = "";
    try {
      while (guard < 250) {
        guard += 1;
        const response = await fetch("/api/shopify/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fresh: fresh && guard === 1 }),
        });
        const body = (await response.json()) as Status;
        setStatus(body);
        if (!response.ok || body.error || body.done) break;
        const stamp = body.stamp || body.message;
        if (stamp === previous) break;
        previous = stamp;
        fresh = false;
      }
    } catch {
      setStatus((current) => ({ ...current, error: true, done: false, message: "The import paused. Press Continue." }));
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <p className={`text-sm font-bold ${status.error ? "text-[#8a5a12]" : "text-[#2c2640]"}`}>{status.message}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={running} onClick={() => run(true)}>
          {running ? "Importing..." : "Import from Shopify"}
        </Button>
        {!status.done ? (
          <Button type="button" variant="outline" disabled={running} onClick={() => run(false)}>
            Continue
          </Button>
        ) : null}
      </div>
    </div>
  );
}
