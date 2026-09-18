import { ShieldAlert } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/**
 * Shown when the viewer has a real, valid admin session but lacks the one
 * permission a given page needs — never a silent redirect and never a
 * generic/opaque error, so the admin understands exactly what's missing.
 */
export function NoAccess({ permission }: { permission: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Empty className="max-w-md border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert />
          </EmptyMedia>
          <EmptyTitle>You don&apos;t have access to this</EmptyTitle>
          <EmptyDescription>
            Your admin account doesn&apos;t have the <code className="rounded bg-muted px-1 py-0.5 text-xs">{permission}</code> permission
            required to view this page. Ask another admin with the &quot;Admins&quot; permission to grant it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
