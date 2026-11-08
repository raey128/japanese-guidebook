export default function PlaceNames({
  name,
  nameJa,
  as,
}: {
  name: string;
  nameJa: string | null;
  as?: "h1" | "h2" | "h3" | "span";
}) {
  const Tag = as ?? "span";
  return (
    <Tag className={as === "h1" ? "text-3xl font-extrabold" : "font-semibold"}>
      {name}
      {nameJa ? (
        <>
          {" "}
          <span lang="ja" className="font-normal text-muted">
            {nameJa}
          </span>
        </>
      ) : null}
    </Tag>
  );
}
