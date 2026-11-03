export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public field?: string,
    public retryAfter?: number,
  ) {
    super(code);
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
