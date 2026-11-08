import { ButtonLink } from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { COPY } from "../copy";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Not found</h1>
      <EmptyState emoji="🗺️" title={COPY.notFound} action={<ButtonLink to="/">Back to the map</ButtonLink>} />
    </div>
  );
}
