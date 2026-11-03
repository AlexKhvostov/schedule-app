// Offline only. Prints a new secret once; it does not connect to or change any database.
const bytes = crypto.getRandomValues(new Uint8Array(32));
const key = "rp_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
console.log(JSON.stringify(
  {
    key,
    sha256: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""),
  },
  null,
  2,
));
