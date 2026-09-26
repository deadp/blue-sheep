// Process-wide cleanup: servers, browsers and child processes register a disposer here.
// Disposers run on normal exit, SIGINT/SIGTERM and uncaught errors, so no probe ever leaves a server behind.

/** @type {Set<() => (void | Promise<void>)>} */
const disposers = new Set();
let installed = false;
let running = false;
let interrupted = false;

/** True once SIGINT/SIGTERM arrived; in-flight steps fail as a side effect and must not be reported as real failures. */
export const isInterrupted = () => interrupted;

/** @param {() => (void | Promise<void>)} fn @returns {() => void} unregister */
export function onCleanup(fn) {
  install();
  disposers.add(fn);
  return () => disposers.delete(fn);
}

export async function cleanupAll() {
  if (running) return;
  running = true;
  for (const fn of [...disposers].reverse()) {
    try { await fn(); } catch { /* best effort */ }
  }
  disposers.clear();
  running = false;
}

function install() {
  if (installed) return;
  installed = true;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
      if (interrupted) return;
      interrupted = true;
      console.error(`\nprobe: ${sig} received, cleaning up`);
      await cleanupAll();
      process.exit(130);
    });
  }
  const crash = async (/** @type {unknown} */ err) => {
    console.error("probe: uncaught error:", err);
    await cleanupAll();
    process.exit(1);
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
}
