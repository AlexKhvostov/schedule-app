export type PersonIdentityNames = { profileName?: string | null; discord?: string | null; winamax?: string | null };

/** Presentation only: missing or duplicate names never produce an empty extra line. */
export function personIdentityNames({ profileName, discord, winamax }: PersonIdentityNames) {
  const name = profileName?.trim() || "";
  const publicNick = discord?.trim() || "";
  return {
    primary: publicNick || name || "—",
    secondary: name && publicNick && name.toLocaleLowerCase() !== publicNick.toLocaleLowerCase() ? name : "",
    winamax: winamax?.trim() || "",
  };
}
