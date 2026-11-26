"use client";

import { useEffect, useRef, useState } from "react";
import { pastelFor, toolMonogram } from "@/lib/monogram";
import { cn } from "@/lib/utils";

const SIZES = {
  /** A chip under the search bar. */
  chip: "h-6 w-6 rounded-full text-[10.5px]",
  /** A playbook card. */
  post: "h-7 w-7 rounded-full text-[11px]",
  /** Stack cards and top 3 rows. */
  sm: "h-[34px] w-[34px] rounded-[9px] text-xs",
  /** The rankings table. */
  md: "h-9 w-9 rounded-[9px] text-[13px]",
} as const;

type Props = { name: string; logoUrl: string | null; size?: keyof typeof SIZES };

/**
 * Tool logo on a small white tile. Without a logo, or when it does not load, two
 * letters on a pastel that is always the same for the same tool.
 */
export function ToolLogoTile({ name, logoUrl, size = "md" }: Props) {
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
    const square = size === "sm" || size === "md";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imageRef}
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className={cn(SIZES[size], "shrink-0 bg-white object-contain", square && "border p-1")}
        loading="lazy"
        onError={() => setFailedUrl(logoUrl)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(SIZES[size], "inline-flex shrink-0 items-center justify-center font-bold text-[#15161A]")}
      style={{ backgroundColor: pastelFor(name) }}
    >
      {toolMonogram(name)}
    </span>
  );
}
