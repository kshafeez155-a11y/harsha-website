import { createFileRoute } from "@tanstack/react-router";

import { requireHubManager } from "@/components/admin/admin-auth";
import { HubDashboard } from "@/components/hub/HubDashboard";

export const Route = createFileRoute("/hub-dashboard")({
  ssr: false,
  beforeLoad: requireHubManager,
  component: HubDashboardPage,
});

function HubDashboardPage() {
  const { hubManager } = Route.useRouteContext();
  return <HubDashboard key={`${hubManager.user_id}:${hubManager.hub_id}`} manager={hubManager} />;
}
