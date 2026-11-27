import { useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";

import type { Schemas } from "../api/client";
import AddPlacesSheet from "../components/lists/AddPlacesSheet";
import ErrorState from "../components/ui/ErrorState";
import Loading from "../components/ui/Loading";
import PlaceArt from "../components/ui/PlaceArt";
import { useMe } from "../hooks/auth";
import { shareList, useDeleteList, useMyList, useRemoveItems, useReorder, useUpdateList } from "../hooks/myLists";

type Item = Schemas["VoteItemOut"];

/** Votes on one place, with who voted (only the owner sees names). */
function Votes({ item }: { item: Item }) {
  const t = item.tally;
  if (!t || t.yes + t.maybe + t.no === 0) return <p className="text-xs text-muted">No votes yet</p>;
  const names = [
    ...t.yes_names.map((n) => `✅ ${n}`),
    ...t.maybe_names.map((n) => `🤔 ${n}`),
    ...t.no_names.map((n) => `✖️ ${n}`),
  ];
  return (
    <p className="text-xs font-bold text-muted">
      <span aria-label={`${t.yes} yes, ${t.maybe} maybe, ${t.no} no`}>
        ✅ {t.yes} · 🤔 {t.maybe} · ✖️ {t.no}
      </span>
      {names.length ? <span className="block truncate font-normal">{names.join(", ")}</span> : null}
    </p>
  );
}

/**
 * Editing a shared list (decided 2026-11-27): rename, voting on/off, share; add many places at
 * once, select and remove many, and reorder by dragging (or Move up / Move down).
 */
export default function ListEditor() {
  const id = Number(useParams().id);
  const uid = useId();
  const navigate = useNavigate();
  const me = useMe();
  const q = useMyList(id);
  const update = useUpdateList(id);
  const remove = useRemoveItems(id);
  const reorder = useReorder(id);
  const del = useDeleteList();
  const [order, setOrder] = useState<Item[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const rows = useRef(new Map<number, HTMLLIElement>());

  useEffect(() => {
    if (q.data) {
      setOrder(q.data.items);
      setTitle(q.data.title);
    }
  }, [q.data]);

  if (me.isPending || q.isPending) return <Loading />;
  if (!me.data?.user) return <Navigate to={`/sign-in?next=${encodeURIComponent(`/lists/mine/${id}`)}`} replace />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const list = q.data;

  const commitOrder = (next: Item[]) => {
    setOrder(next);
    reorder.mutate(next.map((i) => i.item_id));
  };
  const move = (index: number, by: number) => {
    const j = index + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[index], next[j]] = [next[j]!, next[index]!];
    commitOrder(next);
  };

  // Drag by the handle (mouse, pen or finger): reorder as the pointer passes other cards.
  const startDrag = (e: React.PointerEvent, itemId: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(itemId);
  };
  const dragMove = (e: React.PointerEvent) => {
    if (dragId === null) return;
    const y = e.clientY;
    const from = order.findIndex((i) => i.item_id === dragId);
    let to = from;
    order.forEach((it, i) => {
      const el = rows.current.get(it.item_id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2 && i > from) to = i;
      if (y < r.top + r.height / 2 && i < from && to === from) to = i;
    });
    if (to !== from) {
      const next = [...order];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it!);
      setOrder(next);
    }
  };
  const endDrag = () => {
    if (dragId === null) return;
    setDragId(null);
    if (order.map((i) => i.item_id).join() !== list.items.map((i) => i.item_id).join()) commitOrder(order);
  };

  const togglePick = (itemId: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(itemId)) n.delete(itemId);
      else n.add(itemId);
      return n;
    });

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      <Link to="/lists?tab=shared" className="link text-sm">
        ‹ Shared lists
      </Link>

      <header className="space-y-3">
        <label htmlFor={`${uid}-title`} className="sr-only">
          List name
        </label>
        <input
          id={`${uid}-title`}
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title.trim() !== list.title) update.mutate({ title: title.trim() });
          }}
          className="w-full rounded-xl bg-transparent font-display text-3xl font-black focus:bg-white focus:outline-3 focus:outline-stays"
        />
        <p className="text-sm font-bold text-muted">
          {list.place_count} {list.place_count === 1 ? "place" : "places"} in {list.city.name}
          {list.is_open ? ` · ${list.voter_count} ${list.voter_count === 1 ? "person has" : "people have"} voted` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const how = await shareList(list.title, list.share_url);
              setShareMsg(how === "copied" ? "Link copied!" : how === "shared" ? "" : "Couldn't share. Copy it from the address below.");
            }}
          >
            <span aria-hidden="true">🔗</span> Share
          </button>
          <Link to={`/l/${list.token}`} className="btn btn-secondary">
            See it as friends do
          </Link>
          <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-(--radius-chunky) border-2 border-line-strong bg-white px-3 font-bold">
            <input
              type="checkbox"
              role="switch"
              checked={list.is_open}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ is_open: e.target.checked })}
              className="size-5 accent-[var(--color-brand)]"
            />
            Let friends vote
          </label>
          <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-(--radius-chunky) border-2 border-line-strong bg-white px-3 font-bold">
            <input
              type="checkbox"
              role="switch"
              checked={list.is_public}
              disabled={update.isPending}
              onChange={(e) => update.mutate({ is_public: e.target.checked })}
              className="size-5 accent-[var(--color-brand)]"
            />
            Show on Community lists
          </label>
        </div>
        <p aria-live="polite" className="text-sm font-bold text-success-dark">
          {shareMsg}
        </p>
        <p className="break-all text-xs text-muted">{list.share_url}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary flex-1" onClick={() => setAdding(true)}>
          <span aria-hidden="true">＋</span> Add places
        </button>
        {order.length ? (
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((s) => !s);
              setPicked(new Set());
            }}
          >
            {selecting ? "Done selecting" : "Select"}
          </button>
        ) : null}
      </div>

      {selecting ? (
        <div className="sticky top-2 z-10 flex items-center gap-2 rounded-(--radius-chunky) border-2 border-line bg-white p-2 shadow-md">
          <span className="flex-1 font-bold">{picked.size} selected</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set(order.map((i) => i.item_id)))}>
            All
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={picked.size === 0 || remove.isPending}
            onClick={() =>
              remove.mutate([...picked], {
                onSuccess: () => {
                  setPicked(new Set());
                  setSelecting(false);
                },
              })
            }
          >
            Remove {picked.size || ""}
          </button>
        </div>
      ) : null}

      {order.length === 0 ? (
        <p className="card text-center text-muted">No places yet. Tap “Add places” to pick some.</p>
      ) : (
        <ol className="space-y-3" aria-label="Places on this list" onPointerMove={dragMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
          {order.map((item, i) => {
            const p = item.place;
            const on = picked.has(item.item_id);
            return (
              <li
                key={item.item_id}
                ref={(el) => {
                  if (el) rows.current.set(item.item_id, el);
                  else rows.current.delete(item.item_id);
                }}
                className={`card flex items-center gap-3 p-2 transition-shadow ${dragId === item.item_id ? "relative z-10 shadow-xl ring-2 ring-brand" : ""} ${on ? "ring-2 ring-danger" : ""}`}
              >
                {selecting ? (
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => togglePick(item.item_id)}
                    aria-label={`Select ${p.name}`}
                    className="size-6 shrink-0 accent-[var(--color-danger)]"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`Drag to reorder ${p.name}`}
                    onPointerDown={(e) => startDrag(e, item.item_id)}
                    className="flex h-16 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl text-muted hover:bg-stone-100 active:cursor-grabbing"
                  >
                    <span aria-hidden="true">⋮⋮</span>
                  </button>
                )}
                <PlaceArt id={p.id} subcategorySlug={p.subcategory.slug} topCategory={p.subcategory.top_category} image={p.image} className="size-16 text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-black leading-tight">{p.name}</p>
                  <p className="truncate text-sm font-bold text-muted">
                    {p.subcategory.name} · {p.location.is_catch_all ? p.city.name : p.location.name}
                  </p>
                  <Votes item={item} />
                </div>
                {!selecting ? (
                  <div className="flex shrink-0 flex-col">
                    <button type="button" className="btn btn-ghost btn-sm btn-icon size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`}>
                      <span aria-hidden="true">▲</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon size-8"
                      disabled={i === order.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${p.name} down`}
                    >
                      <span aria-hidden="true">▼</span>
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <button
        type="button"
        className="btn btn-ghost btn-sm text-danger"
        onClick={() => {
          if (window.confirm(`Delete “${list.title}”? The link will stop working.`)) {
            del.mutate(list.id, { onSuccess: () => void navigate("/lists?tab=shared") });
          }
        }}
      >
        Delete this list
      </button>

      {adding ? (
        <AddPlacesSheet
          listId={list.id}
          city={list.city}
          onList={new Set(order.map((i) => i.place.id))}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
