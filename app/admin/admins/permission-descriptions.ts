import { PERMISSIONS, type Permission } from "@/lib/permissions";

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  "admin.dashboard.view": { label: "Dashboard", description: "View the customer profiles dashboard and stats." },
  "admin.materials.manage": { label: "Materials", description: "Create and view materials." },
  "admin.licenses.manage": { label: "Licenses", description: "Generate, revoke and replace license serials." },
  "admin.profiles.manage": { label: "Profiles", description: "Edit customer profiles (points, level, blocked status)." },
  "admin.audit.view": { label: "Audit log", description: "View the admin-action audit trail." },
  "admin.live.view": { label: "Live Intelligence", description: "View the live event feed, stats and active sessions." },
  "admin.users.inspect": { label: "User inspector", description: "Open the full detail view for a single customer profile." },
  "admin.security.ip.view": { label: "Unmasked IPs", description: "See full (unmasked) IP addresses in live events." },
  "admin.admins.manage": { label: "Admins", description: "Create admin accounts and manage everyone's permissions — including this page." },
};

export const ALL_PERMISSIONS = PERMISSIONS as readonly Permission[];
