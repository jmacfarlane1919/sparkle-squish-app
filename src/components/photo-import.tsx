"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { unzipSync } from "fflate";
import { Shown } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { contentTypeForPhoto } from "@/lib/photos/match";

type Preview = {
  summary: string;
  matched: { line: number; file: string; productId: string; productTitle: string; role: "original" | "branded" }[];
  unmatched: { line: number; file: string; reason: string }[];
};

export function PhotoImport() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pictures, setPictures] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);

  async function previewCsv(formData: FormData) {
    const file = formData.get("csv");
    if (!(file instanceof File) || file.size === 0) {
      setResult("Choose the photo CSV first.");
      return;
    }
    const text = await file.text();
    const response = await fetch("/api/photos/import?action=preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: text }),
    });
    const body = (await response.json()) as Preview & { error?: string };
    if (!response.ok) {
      setResult(body.error || "The CSV could not be read.");
      return;
    }
    setPreview(body);
    setResult("");
  }

  async function takePictures(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const file of Array.from(list)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
        for (const [name, bytes] of Object.entries(entries)) {
          const base = name.split("/").pop() || "";
          if (!base || !contentTypeForPhoto(base)) continue;
          next.push(new File([new Uint8Array(bytes)], base, { type: contentTypeForPhoto(base) }));
        }
      } else if (contentTypeForPhoto(file.name)) next.push(file);
    }
    setPictures(next);
  }

  async function save() {
    if (!preview || savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    let saved = 0;
    const missing: string[] = [];
    try {
      for (const row of preview.matched) {
        const picture = pictures.find((file) => file.name.toLowerCase() === row.file.toLowerCase());
        if (!picture) {
          missing.push(row.file);
          continue;
        }
        setProgress(`Saving ${saved + 1} of ${preview.matched.length} photos...`);
        const signedResponse = await fetch("/api/photos/import?action=sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ productId: row.productId, file: row.file }),
        });
        const signed = (await signedResponse.json()) as { url?: string | null; contentType?: string; error?: string };
        if (!signedResponse.ok) throw new Error(signed.error || "Could not start that upload.");
        let direct = false;
        if (signed.url && signed.contentType) {
          const put = await fetch(signed.url, { method: "PUT", headers: { "content-type": signed.contentType }, body: picture }).catch(() => null);
          direct = Boolean(put?.ok);
        }
        if (!direct) {
          const form = new FormData();
          form.set("file", picture);
          form.set("productId", row.productId);
          form.set("filename", row.file);
          form.set("role", row.role);
          const posted = await fetch("/api/photos/import?action=file", { method: "POST", body: form });
          const body = (await posted.json()) as { error?: string };
          if (!posted.ok) throw new Error(body.error || `${row.file} could not be saved.`);
        } else {
          const commit = await fetch("/api/photos/import?action=commit", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ productId: row.productId, file: row.file, role: row.role }),
          });
          const body = (await commit.json()) as { error?: string };
          if (!commit.ok) throw new Error(body.error || `${row.file} could not be saved.`);
        }
        saved += 1;
      }
      const missingNote = missing.length ? ` ${missing.length} matched pictures were not in the files you chose.` : "";
      setResult(`Imported ${saved} photos.${missingNote} ${preview.unmatched.length} rows did not match a product.`);
      setProgress("");
      setPreview(null);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "The photo import stopped.");
      setProgress(saved ? `Imported ${saved} of ${preview.matched.length} photos, then stopped.` : "");
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(80,60,110,0.06)]">
      <h2 className="text-lg font-extrabold text-[#2f6fe0]">Product photos</h2>
      <p className="mt-1 text-sm text-[#8a8496]">
        Columns: file, ss_sku, vendor_sku, shopify_product_id, product_title, role. Role is original when the cell is blank. Each picture uploads on its own, so a large set does not have to fit in one request. Nothing is sent to Shopify.
      </p>
      <a className="mt-2 inline-block text-sm font-extrabold text-[#2f6fe0]" href="/samples/product-photos.csv">Download a sample file</a>
      <form className="mt-3 space-y-3" action={previewCsv}>
        <input name="csv" type="file" accept=".csv,text/csv" className="block w-full text-sm" />
        <Button type="submit" variant="secondary" disabled={busy}>Preview</Button>
      </form>
      {preview ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="font-extrabold">{preview.summary}</p>
          {preview.unmatched.map((row) => (
            <p key={`${row.line}-${row.file}`} className="rounded-2xl bg-[#fff8ec] px-3 py-2 text-[#8a5a12]">Line {row.line}: <Shown value={row.reason} /></p>
          ))}
          {preview.matched.slice(0, 8).map((row) => (
            <p key={`${row.line}-${row.file}`} className="rounded-2xl bg-[#f7f4fb] px-3 py-2">Line {row.line}: {row.file} · {row.productTitle} · {row.role}</p>
          ))}
          {preview.matched.length > 8 ? <p className="text-[#8a8496]">And {preview.matched.length - 8} more matched photos.</p> : null}
          <label className="mt-2 block text-sm font-extrabold">
            Pictures or a zip
            <input className="mt-1 block w-full text-sm font-medium" type="file" accept="image/*,.zip" multiple onChange={(event) => takePictures(event.target.files)} />
          </label>
          {pictures.length ? <p className="text-[#8a8496]">{pictures.length} pictures ready.</p> : null}
          {preview.matched.length ? (
            <Button type="button" disabled={busy || pictures.length === 0} onClick={save}>{busy ? "Saving..." : "Save photos"}</Button>
          ) : null}
        </div>
      ) : null}
      {progress ? <p className="mt-3 text-sm font-bold">{progress}</p> : null}
      {result ? (
        <div className="mt-3 rounded-2xl bg-[#e5f6f2] px-4 py-3 text-sm font-bold text-[#14685a]">
          <p><Shown value={result} /></p>
          <Link className="mt-2 inline-block text-[#2f6fe0]" href="/products">Open products</Link>
        </div>
      ) : null}
    </section>
  );
}
