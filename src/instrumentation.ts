export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { cronWorker } = await import("@/lib/cron/worker");
    cronWorker.start();
  }
}
