"use client";

import { useEffect, useState } from "react";
import { getInitDataRaw } from "@/lib/telegram";
import { cn } from "@/lib/utils";

/**
 * Every media-serving route (profile photos, chat photo/voice/sticker) sits
 * behind the same initData auth as the rest of the REST API — but that's a
 * custom header, and a plain <img src="..."> / <audio src="..."> has no way
 * to attach one. So instead of pointing elements straight at the API path,
 * fetch the bytes with the header attached and hand back a blob: object URL
 * — the one thing a browser element CAN load without custom headers.
 */
export function useAuthedObjectUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const rawInitData = getInitDataRaw();

    fetch(path, { headers: rawInitData ? { "x-telegram-init-data": rawInitData } : {} })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`media fetch failed: ${res.status}`))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return url;
}

export function AuthedImg({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const url = useAuthedObjectUrl(path);
  if (!url) return null;
  return <img src={url} alt={alt} className={cn("[animation:fade-in_300ms_ease-out]", className)} />;
}
