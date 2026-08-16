import { withAuth } from "@/server/api";
import { jsonOk } from "@/server/http";
import { requireStaff } from "@/server/rbac";
import { getAppBaseUrl, getSupportEmail } from "@/server/env";

export const GET = withAuth(async (_req, ctx) => {
  requireStaff(ctx);
  return jsonOk({
    support: {
      email: getSupportEmail(),
      appBaseUrl: getAppBaseUrl(),
      privacyPath: "/privacy",
      docs: {
        launch: "docs/LAUNCH.md",
        compliance: "docs/UK_COMPLIANCE.md",
        deploy: "docs/DEPLOY.md",
      },
      jobs: {
        reminders: "POST /api/v1/jobs/reminders",
        retention: "POST /api/v1/jobs/retention",
      },
    },
  });
});
