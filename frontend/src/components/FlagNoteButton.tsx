import { useState } from "react";

import { useFlagNote } from "../hooks/moderation";
import Dialog from "./moderation/Dialog";
import { flagErrorMessage } from "./moderation/errors";

export default function FlagNoteButton({ rankingId }: { rankingId: number }) {
  const [open, setOpen] = useState(false);
  const mutation = useFlagNote(rankingId);

  function close() {
    setOpen(false);
    mutation.reset();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hint underline hover:text-ink"
      >
        Flag note
      </button>
      {open && (
        <Dialog title="Flag this note?" onClose={close}>
          {mutation.isSuccess ? (
            <>
              <p role="status" className="mb-3">
                Thanks — an admin will review it.
              </p>
              <button type="button" onClick={close} className="btn btn-primary">
                Close
              </button>
            </>
          ) : (
            <>
              <p className="mb-3">Report this note as fake or spam? An admin will review it.</p>
              <div aria-live="polite">
                {mutation.error && (
                  <p role="alert" className="mb-3 text-danger">
                    {flagErrorMessage(mutation.error, "note")}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate()}
                  className="btn btn-primary disabled:opacity-60"
                >
                  {mutation.isPending ? "Sending…" : "Flag note"}
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
