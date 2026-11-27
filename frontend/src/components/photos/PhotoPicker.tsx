import { useEffect, useId, useMemo, useRef } from "react";

import { PHOTO_ACCEPT, photoProblem, PHOTOS_PER_REVIEW } from "../../hooks/photos";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  /** Photos already on the review (they count towards the 4). */
  alreadyHave?: number;
  error?: string | null;
};

/**
 * Choose photos to add to a review (R20.2): previews with a remove button each, up to 4 in
 * total. Nothing uploads until the review is saved.
 */
export default function PhotoPicker({ files, onChange, alreadyHave = 0, error }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const room = PHOTOS_PER_REVIEW - alreadyHave - files.length;
  const problem = error ?? photoProblem(files, alreadyHave);

  return (
    <div className="space-y-2">
      <p className="label" id={`${id}-label`}>
        Photos <span className="font-normal text-muted">(up to {PHOTOS_PER_REVIEW})</span>
      </p>
      <div className="flex flex-wrap gap-2" aria-labelledby={`${id}-label`} role="group">
        {previews.map((src, i) => (
          <div key={src} className="relative">
            <img src={src} alt={`New photo ${i + 1}`} className="size-20 rounded-xl border-2 border-line object-cover" />
            <button
              type="button"
              aria-label={`Remove new photo ${i + 1}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border-2 border-white bg-ink text-sm font-extrabold text-white shadow"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        ))}
        {room > 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-20 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-line-strong bg-stone-50 text-xs font-extrabold text-muted hover:bg-stone-100"
          >
            <span aria-hidden="true" className="text-2xl">
              📷
            </span>
            Add photo
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length) onChange([...files, ...picked].slice(0, PHOTOS_PER_REVIEW - alreadyHave));
        }}
      />
      {files.length ? <p className="text-xs text-muted">Location data is removed before sharing.</p> : null}
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
