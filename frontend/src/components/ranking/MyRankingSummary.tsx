import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { api, unwrap, type Schemas } from "../../api/client";
import { invalidateAfterRankingChange } from "../../hooks/ranking";
import { needsComment, reviewProblem } from "../../lib/rating";
import NoteFields, { formatVisit, type NoteValue } from "./NoteFields";
import { Stars } from "./StarRating";

const BUCKET_LABEL = { liked: "Liked", fine: "Fine", disliked: "Disliked" } as const;

/** The viewer's own ranking of a place with inline note editing and delete. */
export default function MyRankingSummary({
  ranking,
  heading = "Your ranking",
  headingId = "my-ranking-h",
}: {
  ranking: Schemas["MyRanking"];
  /** Settings lists many: each gets the place's name as its heading. */
  heading?: ReactNode;
  headingId?: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<NoteValue>({ note: "", month: null, year: null });
  const [noteError, setNoteError] = useState<string | undefined>(undefined);
  const rating = ranking.rating ?? null;
  const startEdit = () => {
    setValue({ note: ranking.note ?? "", month: ranking.visit_month, year: ranking.visit_year });
    setEditing(true);
  };
  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH("/api/rankings/{ranking_id}", {
          params: { path: { ranking_id: ranking.id } },
          body: { note: value.note.trim() || null, visit_month: value.month, visit_year: value.year },
        }),
      ),
    onSuccess: () => {
      setEditing(false);
      invalidateAfterRankingChange(qc);
    },
  });
  const del = useMutation({
    mutationFn: async () => {
      unwrap(await api.DELETE("/api/rankings/{ranking_id}", { params: { path: { ranking_id: ranking.id } } }));
    },
    onSuccess: () => invalidateAfterRankingChange(qc),
  });
  const visit = formatVisit(ranking.visit_month, ranking.visit_year);

  return (
    <section aria-labelledby={headingId} className="card">
      <h2 id={headingId} className="text-lg font-semibold">
        {heading}
      </h2>
      <p>
        {rating ? (
          <>
            <Stars rating={rating} /> ·{" "}
          </>
        ) : null}
        {BUCKET_LABEL[ranking.bucket]} · #{ranking.position} in your list · personal score {ranking.personal_score.toFixed(1)}
      </p>
      {!editing ? (
        <>
          {ranking.note ? <p className="mt-2 whitespace-pre-wrap">{ranking.note}</p> : null}
          {visit ? <p className="hint">Visited {visit}</p> : null}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={startEdit} className="btn btn-secondary btn-sm">
              Edit comment
            </button>
            <button
              type="button"
              disabled={del.isPending}
              onClick={() => {
                if (window.confirm("Delete your ranking of this place?")) del.mutate();
              }}
              className="btn btn-secondary btn-sm text-danger"
            >
              Delete ranking
            </button>
          </div>
        </>
      ) : (
        <form
          className="mt-2 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = rating ? reviewProblem(rating, value.note) : null;
            if (problem?.note) {
              setNoteError(problem.note);
              return;
            }
            save.mutate();
          }}
        >
          <NoteFields
            value={value}
            onChange={(v) => {
              setValue(v);
              setNoteError(undefined);
            }}
            required={needsComment(rating)}
            error={noteError}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="btn btn-primary btn-sm">
              Save comment
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
      <p role="status" className="text-sm text-danger">
        {save.isError ? `Could not save: ${save.error.message}` : del.isError ? `Could not delete: ${del.error.message}` : ""}
      </p>
    </section>
  );
}
