/** Only an explicit invalid/revoked session is a logout, never a network/server failure. */
export function isConfirmedAuthLoss(error: { code?: string; name?: string; status?: number }) {
  if (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500) return false;
  return error.name === "AuthSessionMissingError" || ["bad_jwt", "session_not_found", "user_not_found", "user_banned", "refresh_token_not_found", "refresh_token_already_used"].includes(error.code ?? "");
}
