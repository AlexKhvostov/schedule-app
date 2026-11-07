import { PersonAvatar } from "./PersonAvatar";
import { personIdentityNames, type PersonIdentityNames } from "./formatPersonIdentity";
import "./personIdentity.css";

type Props = PersonIdentityNames & { avatarUrl?: string | null; density?: "compact" | "dense"; className?: string };

/** Shared identity markup for connected people and monthly roster rows. */
export function PersonIdentity({ avatarUrl, density = "compact", className = "", ...identity }: Props) {
  const names = personIdentityNames(identity);
  const heading = [names.name, names.discord].filter(Boolean).join(" ");
  return <span className={`v2-person-identity ${className}`.trim()} data-density={density} title={[heading, names.winamax].filter(Boolean).join("\n")}>
    <PersonAvatar src={avatarUrl} label={names.name} size="sm" />
    <span className="v2-person-identity-text">
      <span className="v2-person-identity-heading" title={heading} data-has-discord={Boolean(names.discord) || undefined}>
        <strong className="v2-person-identity-name" title={names.name}>{names.name}</strong>
        {names.discord && <small className="v2-person-identity-discord" title={names.discord}>{names.discord}</small>}
      </span>
      {names.winamax && <small className="v2-person-identity-winamax" title={`Winamax: ${names.winamax}`}>{names.winamax}</small>}
    </span>
  </span>;
}
