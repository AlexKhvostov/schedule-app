import { PersonAvatar } from "./PersonAvatar";
import { personIdentityNames, type PersonIdentityNames } from "./formatPersonIdentity";
import "./personIdentity.css";

type Props = PersonIdentityNames & { avatarUrl?: string | null; density?: "compact" | "dense"; className?: string };

/** Shared identity markup for connected people and monthly roster rows. */
export function PersonIdentity({ avatarUrl, density = "compact", className = "", ...identity }: Props) {
  const names = personIdentityNames(identity);
  const heading = [names.primary, names.secondary].filter(Boolean).join(" ");
  return <span className={`v2-person-identity ${className}`.trim()} data-density={density} title={[heading, names.winamax].filter(Boolean).join("\n")}>
    <PersonAvatar src={avatarUrl} label={names.primary} size="sm" />
    <span className="v2-person-identity-text">
      <span className="v2-person-identity-heading" title={heading} data-has-secondary={Boolean(names.secondary) || undefined}>
        <strong className="v2-person-identity-primary" title={names.primary}>{names.primary}</strong>
        {names.secondary && <small className="v2-person-identity-secondary" title={names.secondary}>{names.secondary}</small>}
      </span>
      {names.winamax && <small className="v2-person-identity-winamax" title={`Winamax: ${names.winamax}`}>{names.winamax}</small>}
    </span>
  </span>;
}
