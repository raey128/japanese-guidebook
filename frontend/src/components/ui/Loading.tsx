import { COPY } from "../../copy";

export default function Loading({ label = COPY.loading }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 font-bold text-muted">
      <span aria-hidden="true" className="inline-block size-4 animate-spin rounded-full border-3 border-line-strong border-t-brand motion-reduce:animate-none" />
      {label}
    </p>
  );
}
