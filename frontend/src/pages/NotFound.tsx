import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold">Not found</h1>
      <Link className="underline" to="/">Back home</Link>
    </div>
  );
}
