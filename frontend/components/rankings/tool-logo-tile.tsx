"use client";

import { useEffect, useRef, useState } from "react";

type Props = { name: string; logoUrl: string | null; size?: "sm" | "md" };

/**
 * Tool logo in a small white tile. Falls back to the first letter when there is
 * no logo, or when the logo does not load.
 */
export function ToolLogoTile({ name, logoUrl, size = "md" }: Props) {
  const box = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm";
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // An image can fail before React attaches onError (server-rendered page).
  useEffect(() => {
    const image = imageRef.current;
    if (logoUrl && image && image.complete && image.naturalWidth === 0) {
      setFailedUrl(logoUrl);
    }
  }, [logoUrl]);

  if (logoUrl && failedUrl !== logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imageRef}
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className={`${box} shrink-0 rounded-md border bg-white object-contain p-1`}
        loading="lazy"
        onError={() => setFailedUrl(logoUrl)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-foreground`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
