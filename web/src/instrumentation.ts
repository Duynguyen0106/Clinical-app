export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionSecrets } = await import("@/server/env");
    assertProductionSecrets();
    const { assertCronConfiguredInProduction } = await import("@/server/cron");
    assertCronConfiguredInProduction();
  }
}
