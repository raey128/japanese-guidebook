import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useCities } from "../../hooks/lists";
import { useCreateList } from "../../hooks/myLists";
import { getLastCity } from "../../lib/lastCity";
import { track } from "../../lib/track";
import Chip from "../ui/Chip";

/** "New list": a name and a city; it starts with the places you loved there (decided 2026-11-27). */
export default function CreateListDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const cities = useCities();
  const create = useCreateList();
  const [title, setTitle] = useState("");
  const [city, setCity] = useState(getLastCity());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-h`}
        className="card w-full max-w-md space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          create.mutate(
            { title: title.trim(), city_slug: city },
            {
              onSuccess: (lst) => {
                track("share_create");
                void navigate(`/lists/mine/${lst.id}`);
              },
            },
          );
        }}
      >
        <h2 id={`${id}-h`} className="font-display text-2xl font-black">
          New list
        </h2>
        <div>
          <label htmlFor={`${id}-title`} className="label">
            Name it
          </label>
          <input
            ref={input}
            id={`${id}-title`}
            value={title}
            maxLength={80}
            placeholder="Rei's Tokyo recs"
            onChange={(e) => setTitle(e.target.value)}
            className="field"
          />
        </div>
        <div role="group" aria-label="City" className="flex flex-wrap gap-2">
          {(cities.data ?? []).map((c) => (
            <Chip key={c.id} pressed={c.slug === city} onClick={() => setCity(c.slug)}>
              {c.name}
            </Chip>
          ))}
        </div>
        <p className="hint">It starts with the places you loved there. Add, remove and reorder next.</p>
        {create.isError ? (
          <p role="alert" className="text-sm text-danger">
            {create.error.message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary flex-1" disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Making it…" : "Make the list"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
