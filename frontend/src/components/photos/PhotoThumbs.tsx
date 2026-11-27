import { useState } from "react";

import type { Photo } from "../../hooks/photos";
import PhotoViewer from "./PhotoViewer";

/** A row of photo thumbnails that open the full-size viewer (R20.4). */
export default function PhotoThumbs({
  photos,
  signedIn,
  size = "md",
  label = "Photos",
}: {
  photos: Photo[];
  signedIn: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const box = size === "lg" ? "h-32 w-40" : size === "md" ? "size-20" : "size-14";
  return (
    <>
      <ul aria-label={label} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {photos.map((p, i) => (
          <li key={p.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Open photo ${i + 1} of ${photos.length} by ${p.author}`}
              className="block overflow-hidden rounded-xl border-2 border-line"
            >
              <img src={p.thumb_url} alt="" loading="lazy" className={`${box} object-cover`} />
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <PhotoViewer photos={photos} start={open} signedIn={signedIn} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
