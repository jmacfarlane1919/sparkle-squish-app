"use client";

import { useState } from "react";
import type { PrintDirection, PrintTaskName } from "@mmote/niimbluelib";
import { niimbotBitmapSize } from "@/lib/labels/niimbot-bitmap";
import { markLabelsPrinted } from "@/server/actions/labels";

const TASKS = ["B21_V1", "B1", "B21_L2B", "D110", "D110M_V4", "D11_V1", "H1S"] as const satisfies readonly PrintTaskName[];

type LabelItem = {
  name: string;
  price: string;
  sku: string;
  barcode: string;
  qty: number;
};

function padCanvas(source: HTMLCanvasElement, printheadPixels?: number) {
  const width = Math.max(Math.ceil(source.width / 8) * 8, printheadPixels && printheadPixels > source.width ? printheadPixels : 0);
  const height = Math.ceil(source.height / 8) * 8;
  if (width === source.width && height === source.height) return source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, Math.round((width - source.width) / 2), 0);
  return canvas;
}

export function NiimbotPrint({ items }: { items: LabelItem[] }) {
  const [task, setTask] = useState<PrintTaskName | "auto">("auto");
  const [status, setStatus] = useState("Chrome on a computer or Android. iPhone Safari cannot connect. This does not mark labels printed.");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function print() {
    setSent(false);
    if (!items.length) {
      setStatus("Select at least one product with a label count.");
      return;
    }
    if (!("bluetooth" in navigator)) {
      setStatus("This browser can't reach a NIIMBOT. iPhone Safari doesn't include Bluetooth for websites. Use Chrome on a computer or Android, or open the PDF and print it.");
      return;
    }
    setBusy(true);
    setStatus("Looking for the printer…");
    let client: { protocol: { printEnd: () => Promise<unknown> }; disconnect: () => Promise<unknown> } | null = null;
    try {
      const [{ ImageEncoder, NiimbotBluetoothClient, PageColorType }, pdfjs] = await Promise.all([
        import("@mmote/niimbluelib"),
        import("pdfjs-dist"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const printer = new NiimbotBluetoothClient();
      client = printer;
      await printer.connect();
      const meta = printer.getModelMetadata();
      const detected = printer.getPrintTaskType();
      const taskName = task === "auto" ? detected : task;
      if (!taskName) {
        setStatus("The printer connected, but it didn't name its model. Pick B21 or B1 in the list and try again.");
        return;
      }
      const size = niimbotBitmapSize(meta?.dpi);
      if (meta?.printheadPixels && meta.printheadPixels < size.width) {
        setStatus(`This printer's head is too narrow for a 40 mm label. Open the PDF and print that, or use a wider NIIMBOT.`);
        return;
      }
      const response = await fetch("/api/labels/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(({ name, price, sku, barcode }) => ({ name, price, sku, barcode })),
        }),
      });
      if (!response.ok) throw new Error((await response.text()) || "Could not draw the labels.");
      const doc = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;
      const copies = items.reduce((sum, item) => sum + item.qty, 0);
      const direction: PrintDirection = meta?.printDirection || "top";
      const printTask = printer.protocol.newPrintTask(taskName, { totalPages: copies });
      await printTask.printInit();
      for (let index = 0; index < items.length; index += 1) {
        const page = await doc.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: size.width / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not draw the label.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const image = ImageEncoder.encodeCanvas(padCanvas(canvas, meta?.printheadPixels), PageColorType.SingleColor, direction);
        setStatus(`Sending ${items[index].name} (${items[index].qty})…`);
        await printTask.printPage(image, items[index].qty);
        await printTask.waitForPageFinished();
      }
      await printTask.waitForFinished();
      setSent(true);
      setStatus(`Sent ${copies} labels. They are not marked printed yet.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The printer didn't take the labels.");
    } finally {
      if (client) {
        await client.protocol.printEnd().catch(() => undefined);
        await client.disconnect().catch(() => undefined);
      }
      setBusy(false);
    }
  }

  return (
    <div className="basis-full space-y-2 border-t border-[#f0ebf6] pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void print()}
          className="h-11 rounded-2xl bg-[#2c2640] px-4 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "Sending…" : "Print to NIIMBOT (Bluetooth)"}
        </button>
        <label className="text-xs font-extrabold text-[#8a8496]">
          Model
          <select
            className="ml-2 h-10 rounded-2xl border border-[#e4dced] bg-white px-2 text-sm text-[#2c2640]"
            value={task}
            onChange={(event) => setTask(event.target.value as PrintTaskName | "auto")}
          >
            <option value="auto">Use the printer model</option>
            {TASKS.map((name) => (
              <option key={name} value={name}>{name.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        {sent ? (
          <button type="submit" formAction={markLabelsPrinted} className="h-11 rounded-2xl bg-[#e7dff8] px-4 text-sm font-extrabold text-[#4c3d73]">
            Mark these printed
          </button>
        ) : null}
      </div>
      <p className="text-xs text-[#8a8496]">{status}</p>
    </div>
  );
}
