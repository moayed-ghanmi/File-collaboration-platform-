/**
 * Returns `target` only if it is a same-origin relative path, otherwise
 * `fallback`. Prevents open redirects through `?next=` parameters.
 */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return fallback;
  }
  try {
    const url = new URL(target, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
