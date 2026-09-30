import { RemoteError } from "./telegram";
export function retryPolicy(
  e: unknown,
  attempt: number,
  max = 5,
  random = Math.random,
) {
  const retryable =
    e instanceof RemoteError
      ? e.status === 429 ||
        e.status >= 500 ||
        (e.status === 403 &&
          [
            "rateLimitExceeded",
            "userRateLimitExceeded",
            "backendError",
          ].includes(e.reason))
      : e instanceof TypeError ||
        (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name));
  return {
    retry: retryable && attempt < max,
    delaySeconds: Math.max(
      e instanceof RemoteError ? e.retryAfter : 0,
      Math.min(300, 2 ** attempt + random() * 3),
    ),
    code:
      e instanceof RemoteError
        ? `REMOTE_${e.status}`
        : e instanceof Error && /^[A-Z_]+$/.test(e.message)
          ? e.message
          : "INTERNAL_ERROR",
  };
}
