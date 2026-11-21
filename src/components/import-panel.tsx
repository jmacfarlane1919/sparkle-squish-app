"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { commitCsv, previewCsv } from "@/server/actions/import";

export function ImportPanel({
  kind,
  title,
  hint,
  sample,
}: {
  kind: "products" | "suppliers" | "orders";
  title: string;
  hint: string;
  sample: string;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{ ready: { line: number; summary: string }[]; errors: { line: number; message: string }[] } | null>(null);
  const [result, setResult] = useState("");

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
      <h2 className="text-lg font-extrabold text-[#2f6fe0]">{title}</h2>
      <p className="mt-1 text-sm text-[#8a8496]">{hint}</p>
      <a className="mt-2 inline-block text-sm font-extrabold text-[#2f6fe0]" href={sample}>
        Download a sample file
      </a>
      <form
        className="mt-3 space-y-3"
        action={async (formData) => {
          const file = formData.get("file");
          if (!(file instanceof File) || file.size === 0) {
            setResult("Choose a CSV file first.");
            return;
          }
          const text = await file.text();
          setCsv(text);
          setPreview(await previewCsv(kind, text));
          setResult("");
        }}
      >
        <input name="file" type="file" accept=".csv,text/csv" className="block w-full text-sm" />
        <Button type="submit" variant="secondary">
          Preview
        </Button>
      </form>
      {preview ? (
        <div className="mt-4 space-y-2 text-sm">
          {preview.errors.map((error) => (
            <p key={`${error.line}-${error.message}`} className="rounded-2xl bg-[#fde8ef] px-3 py-2 text-[#8d2d52]">
              Line {error.line}: {error.message}
            </p>
          ))}
          {preview.ready.map((row) => (
            <p key={row.line} className="rounded-2xl bg-[#f7f4fb] px-3 py-2">
              Line {row.line}: {row.summary}
            </p>
          ))}
          {preview.errors.length === 0 && preview.ready.length > 0 ? (
            <Button
              type="button"
              onClick={async () => {
                const imported = await commitCsv(kind, csv);
                setResult(imported.errors.length ? imported.errors.map((error) => error.message).join(" ") : `Imported ${imported.imported}.`);
                if (!imported.errors.length) setPreview(null);
              }}
            >
              Import {preview.ready.length}
            </Button>
          ) : null}
        </div>
      ) : null}
      {result ? <p className="mt-3 text-sm font-bold text-[#14685a]">{result}</p> : null}
    </section>
  );
}
