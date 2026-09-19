"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Ban, Fingerprint, KeyRound, ShieldCheck, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { LicenseStatusBadge } from "../_components/license-status-badge";
import { apiFetch, apiPost } from "../_lib/api";
import { formatLocation } from "./format";

type LicenseDetail = { id: number; material: { name: string }; serial: string; status: string; lot: string; createdAt: string; activatedAt: string | null; expiresAt: string | null };
type ActivityEvent = {
  id: number;
  type: string;
  severity: string;
  materialId: number | null;
  licenseId: number | null;
  ip: string;
  country: string;
  region: string;
  city: string;
  device: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
type Inspection = {
  account: { id: string; status: string; presence: string; createdAt: string; lastActivity: string; lastSeenAt: string | null; preferredLanguage: string; rankOverride: number };
  gamification: { points: number; level: number; levelName: string; benefits: unknown[] };
  consent: Record<string, unknown>;
  licenses: LicenseDetail[];
  device: { browser: string } | null;
  location: { country: string; region: string; city: string; approximate: boolean } | null;
  lastKnownIp: string | null;
  activity: ActivityEvent[];
  activityTruncated: boolean;
};

const PRESENCE_LABEL: Record<string, string> = { online: "Online", idle: "Idle", offline: "Offline" };
const PRESENCE_DOT: Record<string, string> = { online: "bg-emerald-400", idle: "bg-amber-400", offline: "bg-muted-foreground/50" };

/**
 * The single "customer profile" surface — opened from Live Intelligence,
 * Licenses (owner column) and the Dashboard, so every admin screen shows
 * the same record instead of three divergent mini-views. `canManageProfiles`
 * is independent from being able to open this at all (admin.users.inspect,
 * checked server-side by the endpoint this fetches): a caller may view the
 * full record without being allowed to edit it.
 */
export function UserInspector({ profileId, canManageProfiles = false, onClose }: { profileId: string | null; canManageProfiles?: boolean; onClose: () => void }) {
  const [data, setData] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setEditing(false);
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
  }, [profileId, reloadToken]);

  async function toggleBlocked() {
    if (!data) return;
    const nextBlocked = data.account.status !== "blocked";
    const result = await apiPost("/api/admin/profiles", {
      id: data.account.id,
      points: data.gamification.points,
      level: data.gamification.level,
      levelName: data.gamification.levelName,
      rankOverride: data.account.rankOverride,
      blocked: nextBlocked,
    });
    if (!result.ok) {
      toast.error("Could not update profile", { description: result.error });
      return;
    }
    toast.success(nextBlocked ? "Profile blocked" : "Profile unblocked");
    setReloadToken((n) => n + 1);
  }

  const activeLicenses = data ? data.licenses.filter((license) => license.status === "active").length : 0;

  return (
    <Dialog open={Boolean(profileId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Customer profile {profileId ?? ""}</DialogTitle>
          <DialogDescription>Full record for this customer profile</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : data ? (
            <>
              <section className="mx-auto flex max-w-xs flex-col items-center gap-3 text-center">
                <Avatar size="lg" className="size-16 shrink-0 ring-2 ring-primary/30">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <UserIcon className="size-7" />
                  </AvatarFallback>
                </Avatar>
                <div className="font-mono text-sm text-foreground">{data.account.id}</div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Badge variant={data.account.status === "blocked" ? "destructive" : "outline"} className={data.account.status === "blocked" ? "" : "border-emerald-900/60 bg-emerald-950/70 text-emerald-400"}>
                    {data.account.status === "blocked" ? "Blocked" : "Active"}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5">
                    <span className={cn("size-1.5 rounded-full", PRESENCE_DOT[data.account.presence] ?? PRESENCE_DOT.offline)} />
                    {PRESENCE_LABEL[data.account.presence] ?? data.account.presence}
                  </Badge>
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                    {data.gamification.levelName} · Level {data.gamification.level}
                  </Badge>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-3 text-center">
                <Stat label="Points" value={data.gamification.points} />
                <Stat label="Active licenses" value={activeLicenses} />
                <Stat label="Benefits" value={data.gamification.benefits.length} />
              </section>

              <section className="space-y-2">
                <SectionTitle>Plan &amp; license</SectionTitle>
                {data.licenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No licenses owned by this profile.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.licenses.map((license) => (
                      <li key={license.id} className="rounded-lg border bg-card/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{license.material.name}</div>
                          <LicenseStatusBadge status={license.status} />
                        </div>
                        <div className="mt-1.5 flex w-fit items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-mono text-xs text-muted-foreground">
                          <Fingerprint className="size-3.5 shrink-0" /> {license.serial}
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <div><dt className="inline font-medium text-foreground/70">Activated: </dt><dd className="inline">{formatDate(license.activatedAt)}</dd></div>
                          <div><dt className="inline font-medium text-foreground/70">Valid until: </dt><dd className="inline">{license.expiresAt ? formatDate(license.expiresAt) : "No expiry"}</dd></div>
                          <div><dt className="inline font-medium text-foreground/70">Lot: </dt><dd className="inline">{license.lot || "—"}</dd></div>
                          <div><dt className="inline font-medium text-foreground/70">Issued: </dt><dd className="inline">{formatDate(license.createdAt)}</dd></div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>Device &amp; access</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Linked device" value={data.device?.browser || "Not available"} />
                  <Field label="Approximate location" value={data.location ? formatLocation(data.location) || "—" : "—"} />
                  <Field label="Last known IP" value={<span className="font-mono">{data.lastKnownIp || "—"}</span>} />
                  <Field label="Language" value={data.account.preferredLanguage || "—"} />
                  <Field label="First seen" value={formatDate(data.account.createdAt)} />
                  <Field label="Last active" value={formatDate(data.account.lastActivity)} />
                </div>
              </section>

              {canManageProfiles && editing ? (
                <EditForm data={data} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setReloadToken((n) => n + 1); }} />
              ) : null}

              <Accordion type="multiple" className="rounded-lg border px-3">
                <AccordionItem value="activity">
                  <AccordionTrigger className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
                    Full activity ({data.activity.length}{data.activityTruncated ? "+" : ""})
                  </AccordionTrigger>
                  <AccordionContent>
                    {data.activity.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recorded activity.</p>
                    ) : (
                      <ul className="space-y-2">
                        {data.activity.map((event) => (
                          <li key={event.id} className="rounded-md border p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{event.type}</span>
                              <span className="text-muted-foreground">{formatDate(event.createdAt)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                              {event.ip ? <span className="font-mono">{event.ip}</span> : null}
                              {formatLocation(event) ? <span>~ {formatLocation(event)}</span> : null}
                              {event.device ? <span>{event.device}</span> : null}
                              {event.licenseId ? <span>License #{event.licenseId}</span> : null}
                              {event.materialId ? <span>Material #{event.materialId}</span> : null}
                              {event.reason ? <span className="italic">{event.reason}</span> : null}
                            </div>
                            {Object.keys(event.metadata).length > 0 ? (
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground/80">{JSON.stringify(event.metadata)}</pre>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="consent">
                  <AccordionTrigger className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">Consent</AccordionTrigger>
                  <AccordionContent>
                    {Object.keys(data.consent).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No consent record stored.</p>
                    ) : (
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(data.consent, null, 2)}</pre>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          ) : null}
        </div>

        {data && canManageProfiles && !editing ? (
          <DialogFooter className="flex-row gap-2 border-t pt-4 sm:justify-stretch">
            <Button variant="outline" className="flex-1 gap-2" onClick={() => setEditing(true)}>
              <KeyRound className="size-4" /> Edit profile
            </Button>
            <Button variant={data.account.status === "blocked" ? "default" : "destructive"} className="flex-1 gap-2" onClick={() => void toggleBlocked()}>
              {data.account.status === "blocked" ? <ShieldCheck className="size-4" /> : <Ban className="size-4" />}
              {data.account.status === "blocked" ? "Unblock" : "Block"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ data, onCancel, onSaved }: { data: Inspection; onCancel: () => void; onSaved: () => void }) {
  const [points, setPoints] = useState(data.gamification.points);
  const [level, setLevel] = useState(data.gamification.level);
  const [levelName, setLevelName] = useState(data.gamification.levelName);
  const [rankOverride, setRankOverride] = useState(data.account.rankOverride);
  const [blocked, setBlocked] = useState(data.account.status === "blocked");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await apiPost("/api/admin/profiles", { id: data.account.id, points, level, levelName, rankOverride, blocked });
    setSaving(false);
    if (!result.ok) {
      toast.error("Could not save profile", { description: result.error });
      return;
    }
    toast.success("Profile updated");
    onSaved();
  }

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <SectionTitle>Edit profile</SectionTitle>
      <div className="space-y-1.5">
        <Label htmlFor="ui-points">Points</Label>
        <Input id="ui-points" type="number" min={0} value={points} onChange={(event) => setPoints(Number(event.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ui-level">Level</Label>
          <Input id="ui-level" type="number" min={1} max={5} value={level} onChange={(event) => setLevel(Number(event.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ui-rank">Rank override</Label>
          <Input id="ui-rank" type="number" min={0} max={5} value={rankOverride} onChange={(event) => setRankOverride(Number(event.target.value))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ui-level-name">Level name</Label>
        <Input id="ui-level-name" maxLength={40} value={levelName} onChange={(event) => setLevelName(event.target.value)} />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="text-sm font-medium">Blocked</div>
          <div className="text-xs text-muted-foreground">Prevents this profile from redeeming or logging in.</div>
        </div>
        <Switch checked={blocked} onCheckedChange={setBlocked} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button className="flex-1" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
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
