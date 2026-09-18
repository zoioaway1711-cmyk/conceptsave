"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { LicenseStatusBadge } from "../_components/license-status-badge";
import { apiFetch } from "../_lib/api";
import { formatLocation } from "./format";

type Inspection = {
  account: { id: string; status: string; presence: string; createdAt: string; lastActivity: string };
  gamification: { points: number; levelName: string; benefits: unknown[] };
  licenses: { id: number; material: { name: string }; serial: string; status: string }[];
  device: { browser: string } | null;
  location: { country: string; region: string; city: string; approximate: boolean } | null;
  activity: { type: string; ip: string; country: string; region: string; city: string; device: string; createdAt: string }[];
};

export function UserInspector({ profileId, onClose }: { profileId: string | null; onClose: () => void }) {
  const [data, setData] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!profileId) {
        setData(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      apiFetch<Inspection>(`/api/admin/users/${encodeURIComponent(profileId)}`).then((result) => {
        if (cancelled) return;
        if (result.ok) setData(result.data);
        else setError(result.status === 403 ? "You don't have the admin.users.inspect permission." : result.status === 404 ? "Profile not found." : result.error);
        setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profileId]);

  return (
    <Sheet open={Boolean(profileId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{profileId ?? ""}</SheetTitle>
          <SheetDescription>User inspector</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : data ? (
            <div className="space-y-5">
              <section className="grid grid-cols-2 gap-3">
                <Field label="Status" value={<Badge variant={data.account.status === "blocked" ? "destructive" : "outline"}>{data.account.status}</Badge>} />
                <Field label="Presence" value={<Badge variant="outline" className="capitalize">{data.account.presence}</Badge>} />
                <Field label="Created" value={formatDate(data.account.createdAt)} />
                <Field label="Last activity" value={formatDate(data.account.lastActivity)} />
              </section>

              <section className="rounded-md border p-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Gamification</h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-lg font-semibold">{data.gamification.points}</div><div className="text-xs text-muted-foreground">Points</div></div>
                  <div><div className="text-lg font-semibold">{data.gamification.levelName}</div><div className="text-xs text-muted-foreground">Level</div></div>
                  <div><div className="text-lg font-semibold">{data.gamification.benefits.length}</div><div className="text-xs text-muted-foreground">Benefits</div></div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Licenses ({data.licenses.length})</h3>
                {data.licenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No licenses owned.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.licenses.map((license) => (
                      <li key={license.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                        <div>
                          <div className="font-medium">{license.material.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{license.serial}</div>
                        </div>
                        <LicenseStatusBadge status={license.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Device &amp; approximate location</h3>
                <p className="text-sm text-muted-foreground">
                  {data.device?.browser || "Unknown device"}
                  {data.location ? ` · ${formatLocation(data.location) || "Location unavailable"} (approximate)` : ""}
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent activity</h3>
                {data.activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recorded activity.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.activity.map((event, index) => (
                      <li key={index} className="rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{event.type}</span>
                          <span className="text-muted-foreground">{formatDate(event.createdAt)}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground">{formatLocation(event) || "—"} {event.device ? `· ${event.device}` : ""}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
