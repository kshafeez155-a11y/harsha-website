import { createFileRoute } from "@tanstack/react-router";

import { FounderConnectionsAdmin } from "@/components/admin/FounderConnectionsAdmin";
import { requireAdmin } from "@/components/admin/admin-auth";

export const Route = createFileRoute("/admin/founder-connections")({
  ssr: false,
  beforeLoad: requireAdmin,
  component: FounderConnectionsAdmin,
});
