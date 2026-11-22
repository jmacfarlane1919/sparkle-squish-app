"use client";

import { useMemo, useState } from "react";

export type BookAccount = { id: string; code: string; name: string; type: string; systemKey: string | null };

type Line = { accountId: string; amount: string; memo: string; isAsset: boolean };

export function BooksLines({
  accounts,
  inventoryId,
  equipmentId,
  defaultLines,
}: {
  accounts: BookAccount[];
  inventoryId: string;
  equipmentId: string;
  defaultLines?: Line[];
}) {
  const [lines, setLines] = useState<Line[]>(
    defaultLines?.length ? defaultLines : [{ accountId: inventoryId, amount: "", memo: "", isAsset: false }],
  );
  const payload = useMemo(() => JSON.stringify(lines), [lines]);
  const choices = accounts.filter((account) => account.type === "expense" || account.type === "cogs" || account.type === "asset");

  function update(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="lines" value={payload} />
      {lines.map((line, index) => (
        <div key={index} className="rounded-2xl border border-[#f0ebf6] p-3">
          <label className="block text-sm font-extrabold">
            What was it?
            <select
              className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] bg-white px-3 text-sm"
              value={line.accountId}
              onChange={(event) => update(index, { accountId: event.target.value })}
            >
              {choices.map((account) => (
                <option key={account.id} value={account.id}>{account.code} {account.name}</option>
              ))}
            </select>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm font-extrabold">
              Amount
              <input
                className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3"
                inputMode="decimal"
                placeholder="0.00"
                value={line.amount}
                onChange={(event) => update(index, { amount: event.target.value })}
              />
            </label>
            <label className="text-sm font-extrabold">
              Note
              <input
                className="mt-1 h-11 w-full rounded-2xl border border-[#e4dced] px-3"
                value={line.memo}
                onChange={(event) => update(index, { memo: event.target.value })}
              />
            </label>
          </div>
          <label className="mt-2 flex items-start gap-2 text-sm font-bold">
            <input
              type="checkbox"
              className="mt-1"
              checked={line.isAsset}
              onChange={(event) => update(index, { isAsset: event.target.checked, accountId: event.target.checked ? equipmentId : line.accountId })}
            />
            <span>This is equipment or something I keep, not product I will sell. It goes on the equipment list instead of counting as an expense.</span>
          </label>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-extrabold text-[#2f6fe0]"
        onClick={() => setLines((current) => [...current, { accountId: inventoryId, amount: "", memo: "", isAsset: false }])}
      >
        Add another line
      </button>
    </div>
  );
}
