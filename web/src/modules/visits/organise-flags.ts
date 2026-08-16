/** Pure flag — kept separate so unit tests do not load Prisma. */
export function organiseAsyncEnabled() {
  const v = (process.env.AI_ORGANISE_ASYNC ?? "true").toLowerCase();
  return v !== "0" && v !== "false" && v !== "sync";
}
