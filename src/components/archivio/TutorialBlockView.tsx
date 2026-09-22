import type { TutorialBlock } from "@/lib/archivio/tutorial-types";

export function TutorialBlockView({ block }: { block: TutorialBlock }) {
  if (block.type === "h") {
    return (
      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {block.text}
      </h3>
    );
  }
  if (block.type === "p") {
    return <p className="text-[15px] leading-7 text-slate-800">{block.text}</p>;
  }
  if (block.type === "ul") {
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-slate-800">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-slate-800">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "code") {
    return (
      <figure className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
        {block.caption ? (
          <figcaption className="border-b border-slate-800 px-3 py-1.5 text-xs text-slate-400">
            {block.caption}
          </figcaption>
        ) : null}
        <pre className="overflow-x-auto p-3 text-[13px] leading-6 text-slate-100">
          <code>{block.text}</code>
        </pre>
      </figure>
    );
  }
  if (block.type === "note") {
    return (
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-950">
        {block.text}
      </p>
    );
  }
  if (block.type === "warn") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
        {block.text}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {block.headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-t border-[var(--border)] align-top">
              {row.map((cell, j) => (
                <td key={`${i}-${j}`} className="px-3 py-2 text-slate-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
