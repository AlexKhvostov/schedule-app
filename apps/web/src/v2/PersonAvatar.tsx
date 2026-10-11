import * as React from "react";

function initialsOf(label: string) {
  return label.replace(/[^a-zA-Zа-яА-Я0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

export function PersonAvatar({
  src,
  label,
  size = "md",
}: {
  src?: string | null;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const image = src?.trim() || null;
  return <AvatarImage key={image ?? "empty"} src={image} label={label} size={size} />;
}

function AvatarImage({ src, label, size }: { src: string | null; label: string; size: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = React.useState(false);
  if (src && !failed) return <img className={`v2-ava is-${size}`} src={src} alt="" decoding="async" onError={() => setFailed(true)} />;
  return <span className={`v2-ava is-${size} is-empty`} aria-hidden="true">{initialsOf(label)}</span>;
}

export function PersonChip({
  src,
  name,
  sub,
  size = "md",
  onClick,
}: {
  src?: string | null;
  name: string;
  sub?: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}) {
  const body = (
    <>
      <PersonAvatar src={src} label={name} size={size} />
      <span>
        <b>{name}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </>
  );
  if (!onClick) return <div className="v2-club-person">{body}</div>;
  return (
    <button type="button" className="v2-club-person" onClick={onClick}>
      {body}
    </button>
  );
}
