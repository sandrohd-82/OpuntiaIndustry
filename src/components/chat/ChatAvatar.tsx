"use client";

type Props = {
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
};

/** Iniziali da nome/cognome (o email). */
export function chatInitials(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return "?";
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (
      (parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")
    ).toUpperCase();
  }
  const one = parts[0] ?? "?";
  if (one.includes("@")) {
    return one.slice(0, 2).toUpperCase();
  }
  return one.slice(0, 2).toUpperCase();
}

export function ChatAvatar({
  name,
  photoUrl,
  size = 36,
  className = "",
}: Props) {
  const initials = chatInitials(name);
  const url = photoUrl?.trim() || null;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-slate-200 text-slate-700 ring-1 ring-black/5 ${className}`}
      style={{ width: size, height: size }}
      title={name}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const sib = e.currentTarget.nextElementSibling;
            if (sib instanceof HTMLElement) sib.style.display = "flex";
          }}
        />
      ) : null}
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold"
        style={{
          fontSize: Math.max(10, Math.round(size * 0.34)),
          display: url ? "none" : "flex",
        }}
      >
        {initials}
      </span>
    </div>
  );
}
