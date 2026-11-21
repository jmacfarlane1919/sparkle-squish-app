"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ScanField({
  name = "code",
  placeholder = "Scan or type a barcode",
  autoFocus = true,
  label = "Barcode",
}: {
  name?: string;
  placeholder?: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      <span className="mb-1.5 block text-sm font-extrabold text-[#2c2640]">{label}</span>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          name={name}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 flex-1 rounded-2xl border border-[#e4dced] bg-white px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fe0]"
        />
        <button
          type="button"
          className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e7dff8] text-[#5b4684]"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
          aria-label="Open camera"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-[#8d2d52]">{error}</p> : null}
      {open ? (
        <CameraScanner
          onClose={() => setOpen(false)}
          onError={(message) => {
            setError(message);
            setOpen(false);
          }}
          onResult={(value) => {
            if (inputRef.current) {
              inputRef.current.value = value;
              setOpen(false);
              inputRef.current.form?.requestSubmit();
            }
          }}
        />
      ) : null}
    </div>
  );
}

function CameraScanner({
  onResult,
  onClose,
  onError,
}: {
  onResult: (value: string) => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (result && !stopped) onResultRef.current(result.getText());
        });
      } catch (error) {
        if (!stopped) onError(error instanceof Error ? error.message : "The camera could not start. You can still type the code.");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [onError]);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-[#1d1830]">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-white">
        Point the camera at a barcode
        <button type="button" onClick={onClose} aria-label="Close camera">
          <X className="h-4 w-4" />
        </button>
      </div>
      <video ref={videoRef} className="aspect-video w-full" muted playsInline />
    </div>
  );
}
