export type CheckResult = { ok: boolean; latencyMs: number; error?: string };
export type Checks = Record<string, () => Promise<unknown>>;

const TIMEOUT_MS = 3000;

async function run(check: () => Promise<unknown>): Promise<CheckResult> {
  const start = performance.now();
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runHealthChecks(checks: Checks) {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, fn]) => [name, await run(fn)] as const),
  );
  const services = Object.fromEntries(entries);
  const ok = entries.every(([, r]) => r.ok);
  return { status: ok ? "ok" : "degraded", services } as const;
}
