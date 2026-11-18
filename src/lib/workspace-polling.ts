import { WORKSPACE_IDLE_MS } from "@/lib/workspace-sync";

/** Small scheduler with injectable clock/timers for deterministic lifecycle tests. */
export function createWorkspacePoller(options: {
  interval: number;
  refresh: () => Promise<boolean>;
  visible: () => boolean;
  online: () => boolean;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let lastActivity = now();
  let lastCheck = -Infinity;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  const idle = () => now() - lastActivity >= WORKSPACE_IDLE_MS;
  const available = () => !stopped && options.visible() && options.online() && !idle();
  function clear() {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }
  function plan() {
    clear();
    if (!available()) return;
    timer = schedule(() => void check(), Math.min(options.interval * 2 ** failures, 300_000));
  }
  async function check() {
    clear();
    if (!available() || running) return;
    if (now() - lastCheck < 1_000) { plan(); return; }
    running = true;
    lastCheck = now();
    try {
      failures = await options.refresh() ? 0 : Math.min(failures + 1, 5);
    } catch {
      failures = Math.min(failures + 1, 5);
    } finally {
      running = false;
      plan();
    }
  }
  plan();
  return {
    activity() {
      const wasIdle = idle();
      lastActivity = now();
      if (wasIdle) void check();
    },
    resume() {
      if (!options.visible() || !options.online()) { clear(); return; }
      lastActivity = now();
      failures = 0;
      void check();
    },
    stop() { stopped = true; clear(); }
  };
}
