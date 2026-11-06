import { expect, it } from "vitest";
import { isConfirmedAuthLoss } from "./authFailure";

it.each([{ status: 504 }, { status: 503, code: "bad_jwt" }, { name: "AuthRetryableFetchError" }, { status: 429 }, { status: 401 }, { code: "request_timeout" }])("does not equate an unavailable or unknown error with logout: %j", error => {
  expect(isConfirmedAuthLoss(error)).toBe(false);
});
it.each([{ name: "AuthSessionMissingError" }, { code: "bad_jwt" }, { code: "session_not_found" }, { code: "user_banned" }, { code: "refresh_token_not_found" }])("recognizes confirmed loss of authentication: %j", error => {
  expect(isConfirmedAuthLoss(error)).toBe(true);
});
