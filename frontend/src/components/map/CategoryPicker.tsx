import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import { api, ApiError, unwrap, type Schemas } from "../../api/client";
import { useSubcategories } from "../../hooks/map";
import { TOP_CATEGORY_INFO, topCategoryInfo, type TopCategory } from "../../lib/categories";
import Chip from "../ui/Chip";

type Props = {
  value: number | null;
  onChange: (id: number) => void;
  error?: string;
};

/**
 * Category for a new place as chips, not a dropdown (R13.13): pick the big group, then the kind.
 * "+ New" adds a kind that isn't listed yet.
 */
export default function CategoryPicker({ value, onChange, error }: Props) {
  const id = useId();
  const qc = useQueryClient();
  const subs = useSubcategories();
  const all = subs.data ?? [];
  const selected = all.find((s) => s.id === value) ?? null;
  // No group open until one is tapped (or a guess from the name search picks one).
  const [top, setTop] = useState<TopCategory | null>((selected?.top_category as TopCategory) ?? null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // A guess from the name suggestions can arrive later: follow it to its group.
  useEffect(() => {
    if (selected) setTop(selected.top_category as TopCategory);
  }, [selected]);

  const create = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/api/subcategories", { body: { name: newName.trim(), top_category: top ?? "food" } })),
    onSuccess: (sub: Schemas["SubcategoryOut"]) => {
      qc.setQueryData<Schemas["SubcategoryOut"][]>(["subcategories"], (old) =>
        old && !old.some((s) => s.id === sub.id) ? [...old, sub] : old,
      );
      void qc.invalidateQueries({ queryKey: ["subcategories"] });
      onChange(sub.id);
      setAdding(false);
      setNewName("");
    },
  });

  const info = top ? topCategoryInfo(top) : undefined;
  const inGroup = top ? all.filter((s) => s.top_category === top) : [];
  const createError =
    create.error instanceof ApiError && create.error.status === 422 ? "Give the category a name (2–40 letters)." : create.error?.message;

  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined} className="space-y-2">
      <legend className="label">
        Category <span aria-hidden="true">*</span>
      </legend>
      <div role="group" aria-label="Group" className="flex flex-wrap gap-2">
        {TOP_CATEGORY_INFO.map((c) => (
          <Chip
            key={c.slug}
            pressed={top === c.slug}
            emoji={c.emoji}
            color={c.color}
            colorDark={c.colorDark}
            onClick={() => {
              setTop(top === c.slug && !selected ? null : c.slug);
              setAdding(false);
            }}
          >
            {c.slug === "experiences" ? "Experiences" : c.name}
          </Chip>
        ))}
      </div>
      {info ? (
      <div role="group" aria-label={`${info.name} kinds`} className="flex flex-wrap gap-2 rounded-(--radius-card) bg-stone-50 p-2">
        {subs.isPending ? <p className="hint px-2">Loading…</p> : null}
        {inGroup.map((s) => (
          <Chip
            key={s.id}
            pressed={value === s.id}
            color={info.color}
            colorDark={info.colorDark}
            onClick={() => onChange(s.id)}
            className="min-h-9 px-3 py-1"
          >
            {s.name}
          </Chip>
        ))}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="chip min-h-9 border-dashed px-3 py-1 text-muted"
          >
            <span aria-hidden="true">＋</span> New
          </button>
        ) : null}
      </div>
      ) : null}
      {adding && info ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label htmlFor={`${id}-new`} className="label">
              New {info.slug === "experiences" ? "experience" : info.name.toLowerCase()} category
            </label>
            <input
              id={`${id}-new`}
              value={newName}
              maxLength={40}
              autoFocus
              placeholder={top === "food" ? "e.g. Curry" : top === "sights" ? "e.g. Bridge" : top === "stays" ? "e.g. Capsule hotel" : "e.g. Karaoke"}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newName.trim().length >= 2) create.mutate();
                } else if (e.key === "Escape") {
                  setAdding(false);
                }
              }}
              className="field"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={newName.trim().length < 2 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Adding…" : "Add"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
            Cancel
          </button>
          {createError ? (
            <p role="alert" className="w-full text-sm text-danger">
              {createError}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
