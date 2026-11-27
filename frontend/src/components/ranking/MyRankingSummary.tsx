import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { api, unwrap, type Schemas } from "../../api/client";
import { invalidateAfterPhotoChange, photoProblem, PHOTOS_PER_REVIEW, uploadReviewPhotos } from "../../hooks/photos";
import { invalidateAfterRankingChange } from "../../hooks/ranking";
import PhotoPicker from "../photos/PhotoPicker";
import PhotoThumbs from "../photos/PhotoThumbs";
import { needsComment, reviewProblem } from "../../lib/rating";
import NoteFields, { formatVisit, type NoteValue } from "./NoteFields";
import { RatingBadge } from "./NumberRating";

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
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const photos = ranking.photos ?? [];
  const rating = ranking.rating ?? null;
  const startEdit = () => {
    setValue({ note: ranking.note ?? "", month: ranking.visit_month, year: ranking.visit_year });
    setEditing(true);
  };
  const save = useMutation({
    mutationFn: async () => {
      const out = unwrap(
        await api.PATCH("/api/rankings/{ranking_id}", {
          params: { path: { ranking_id: ranking.id } },
          body: { note: value.note.trim() || null, visit_month: value.month, visit_year: value.year },
        }),
      );
      if (newPhotos.length) await uploadReviewPhotos(ranking.id, newPhotos);
      return out;
    },
    onSuccess: () => {
      setNewPhotos([]);
      invalidateAfterPhotoChange(qc);
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
            <RatingBadge rating={rating} /> ·{" "}
          </>
        ) : null}
        #{ranking.position} in your {BUCKET_LABEL[ranking.bucket].toLowerCase()} list · your score {ranking.personal_score.toFixed(1)}
      </p>
      {!editing ? (
        <>
          {ranking.note ? <p className="mt-2 whitespace-pre-wrap">{ranking.note}</p> : null}
          {visit ? <p className="hint">Visited {visit}</p> : null}
          {photos.length ? (
            <div className="mt-2">
              <PhotoThumbs photos={photos} signedIn label="Your photos" />
            </div>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={startEdit} className="btn btn-secondary btn-sm">
              Edit comment{photos.length < PHOTOS_PER_REVIEW ? " & photos" : ""}
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
          noValidate
          className="mt-2 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (photoProblem(newPhotos, photos.length)) return;
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
          <PhotoPicker files={newPhotos} onChange={setNewPhotos} alreadyHave={photos.length} />
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
