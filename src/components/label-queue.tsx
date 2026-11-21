"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { LABEL_SIZES } from "@/lib/labels/sizes";
import { printLabels } from "@/server/actions/labels";

export type QueueRow = {
  id: string;
  receivedOn: string;
  receivedLabel: string;
  source: string;
  suggestedQty: number;
  printQty: number;
  name: string;
  price: string;
  sku: string;
  barcode: string;
};

export function LabelQueue({ groups }: { groups: { date: string; label: string; items: QueueRow[] }[] }) {
  const all = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(all.map((item) => [item.id, item.printQty])));
  const [size, setSize] = useState("niimbot-40x20");
  const selectedIds = all.filter((item) => selected[item.id]).map((item) => item.id);
  const stickerCount = selectedIds.reduce((sum, id) => sum + (qty[id] || 0), 0);

  function setDate(date: string, on: boolean) {
    setSelected((current) => {
      const next = { ...current };
      for (const item of all.filter((row) => row.receivedOn === date)) next[item.id] = on;
      return next;
    });
  }

  const payload = (
    <>
      <input type="hidden" name="size" value={size} />
      <input type="hidden" name="selected" value={JSON.stringify(selectedIds)} />
      <input type="hidden" name="qtys" value={JSON.stringify(all.map((item) => ({ id: item.id, qty: qty[item.id] ?? 0 })))} />
    </>
  );

  return (
    <form action={printLabels} className="space-y-4">
      {payload}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-sm font-extrabold text-[#2f6fe0]" onClick={() => setSelected(Object.fromEntries(all.map((item) => [item.id, true])))}>
          Select all
        </button>
        <button type="button" className="text-sm font-extrabold text-[#8a8496]" onClick={() => setSelected({})}>
          Clear
        </button>
        <label className="ml-auto text-sm font-extrabold">
          Size
          <select className="ml-2 h-10 rounded-2xl border border-[#e4dced] bg-white px-3 text-sm" value={size} onChange={(event) => setSize(event.target.value)}>
            {LABEL_SIZES.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      {groups.map((group) => (
        <section key={group.date} className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-extrabold text-[#2c2640]">{group.label}</h2>
            <button type="button" className="text-xs font-extrabold text-[#2f6fe0]" onClick={() => setDate(group.date, true)}>
              Select this day
            </button>
          </div>
          <ul className="space-y-3">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={Boolean(selected[item.id])}
                  onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))}
                  aria-label={`Select ${item.name}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{item.name}</p>
                  <p className="text-xs text-[#8a8496]">{item.sku} · {item.barcode || "No S&S barcode"}</p>
                  <p className="text-xs text-[#8a8496]">{item.price} · suggested {item.suggestedQty}</p>
                </div>
                <label className="text-xs font-extrabold text-[#8a8496]">
                  Labels
                  <input
                    type="number"
                    min={0}
                    className="mt-1 block h-10 w-16 rounded-2xl border border-[#e4dced] px-2 text-base font-extrabold text-[#2c2640]"
                    value={qty[item.id] ?? 0}
                    onChange={(event) => setQty((current) => ({ ...current, [item.id]: Number(event.target.value) }))}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-[22px] bg-white p-3 shadow-[0_8px_24px_rgba(80,60,110,0.12)]">
        <Button type="submit">Print selected{selectedIds.length ? ` (${stickerCount})` : ""}</Button>
        <button formAction="/api/labels/niimbot" formMethod="post" className="h-11 rounded-2xl bg-[#e7dff8] px-4 text-sm font-extrabold text-[#4c3d73]">
          Export for NIIMBOT
        </button>
        <button formAction="/api/labels/report?format=csv" formMethod="post" className="h-11 rounded-2xl bg-[#f7f4fb] px-4 text-sm font-extrabold text-[#4c3d73]">
          CSV
        </button>
        <button formAction="/api/labels/report?format=pdf" formMethod="post" className="h-11 rounded-2xl border border-[#e4dced] bg-white px-4 text-sm font-extrabold">
          PDF list
        </button>
      </div>
    </form>
  );
}
