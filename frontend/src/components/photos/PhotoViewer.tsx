import { useEffect, useRef, useState } from "react";

import { useDeletePhoto, useReportPhoto, type Photo } from "../../hooks/photos";

/**
 * Full-size photo viewer (R20.4): ← / → (or swipe buttons) between photos, Escape closes.
 * Your own photo can be deleted; anyone signed in can report someone else's.
 */
export default function PhotoViewer({
  photos,
  start,
  signedIn,
  onClose,
}: {
  photos: Photo[];
  start: number;
  signedIn: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [reported, setReported] = useState<Set<number>>(new Set());
  const del = useDeletePhoto();
  const report = useReportPhoto();
  const closeRef = useRef<HTMLButtonElement>(null);
  const photo = photos[Math.min(i, photos.length - 1)];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((x) => Math.min(photos.length - 1, x + 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, onClose]);

  if (!photo) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${i + 1} of ${photos.length} by ${photo.author}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white"
      onClick={onClose}
    >
      <div className="flex items-center gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <span className="flex-1 text-sm font-bold">
          {photo.author} · {i + 1} / {photos.length}
        </span>
        {photo.is_own ? (
          <button
            type="button"
            className="btn btn-sm border-white/30 bg-white/10 text-white"
            disabled={del.isPending}
            onClick={() =>
              del.mutate(photo.id, {
                onSuccess: () => {
                  if (photos.length <= 1) onClose();
                  else setI((x) => Math.max(0, x - (x === photos.length - 1 ? 1 : 0)));
                },
              })
            }
          >
            Delete photo
          </button>
        ) : signedIn ? (
          <button
            type="button"
            className="btn btn-sm border-white/30 bg-white/10 text-white"
            disabled={report.isPending || reported.has(photo.id)}
            onClick={() => report.mutate(photo.id, { onSuccess: () => setReported((s) => new Set(s).add(photo.id)) })}
          >
            {reported.has(photo.id) ? "Reported, thanks" : "Report photo"}
          </button>
        ) : null}
        <button ref={closeRef} type="button" aria-label="Close photo" onClick={onClose} className="btn btn-sm btn-icon size-10 border-white/30 bg-white/10 text-white">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        <img src={photo.url} alt={`Photo by ${photo.author}`} className="max-h-full max-w-full rounded-xl object-contain" />
        {i > 0 ? (
          <button type="button" aria-label="Previous photo" onClick={() => setI(i - 1)} className="absolute left-3 flex size-11 items-center justify-center rounded-full bg-white/20 text-2xl">
            <span aria-hidden="true">‹</span>
          </button>
        ) : null}
        {i < photos.length - 1 ? (
          <button type="button" aria-label="Next photo" onClick={() => setI(i + 1)} className="absolute right-3 flex size-11 items-center justify-center rounded-full bg-white/20 text-2xl">
            <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </div>
      {del.isError || report.isError ? (
        <p role="alert" className="p-3 text-center text-sm">
          {(del.error ?? report.error)?.message}
        </p>
      ) : null}
    </div>
  );
}
