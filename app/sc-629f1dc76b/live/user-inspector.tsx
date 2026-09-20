"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Ban, Eye, EyeOff, Fingerprint, KeyRound, MapPin, MapPinOff, NotebookPen, ShieldCheck, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { computeRank } from "@/lib/rank";
import { formatRelativeTime } from "@/lib/presence";
import { RankBadge } from "@/components/clube-save/RankBadge";
import { LicenseStatusBadge } from "../_components/license-status-badge";
import { apiFetch, apiPatch, apiPost } from "../_lib/api";
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
  deviceFingerprint: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
type AdminNote = { id: number; adminId: string; adminUsername: string; body: string; createdAt: string };
type Inspection = {
  account: { id: string; status: string; presence: string; createdAt: string; lastActivity: string; lastSeenAt: string | null; preferredLanguage: string; rankOverride: number };
  gamification: { points: number; level: number; levelName: string; benefits: unknown[] };
  consent: Record<string, unknown>;
  licenses: LicenseDetail[];
  device: { browser: string; fingerprint: string | null } | null;
  location: { country: string; region: string; city: string; approximate: boolean } | null;
  geoPermission: { status: string; latitude: number | null; longitude: number | null; accuracy: number | null; reportedAt: string } | null;
  lastKnownIp: string | null;
  sameDeviceProfiles: string[];
  activity: ActivityEvent[];
  activityTruncated: boolean;
};

const PRESENCE_LABEL: Record<string, string> = { online: "Online", idle: "Idle", offline: "Offline" };
const PRESENCE_DOT: Record<string, string> = { online: "bg-emerald-400", idle: "bg-amber-400", offline: "bg-muted-foreground/50" };
const GEO_PERMISSION_LABEL: Record<string, string> = {
  granted: "Permitiu",
  denied: "Negou",
  unavailable: "Indisponível",
  unsupported: "Sem suporte no navegador",
};

/**
 * The single "customer profile" surface — opened from Live Intelligence,
 * Licenses (owner column) and the Dashboard, so every admin screen shows
 * the same record instead of three divergent mini-views. `canManageProfiles`
 * is independent from being able to open this at all (admin.users.inspect,
 * checked server-side by the endpoint this fetches): a caller may view the
 * full record without being allowed to edit it.
 */
export function UserInspector({ profileId, canManageProfiles = false, canRevealSerial = false, onClose }: { profileId: string | null; canManageProfiles?: boolean; canRevealSerial?: boolean; onClose: () => void }) {
  const [data, setData] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [notesReloadToken, setNotesReloadToken] = useState(0);
  // Same contract as the Licenses page's own reveal toggle (see
  // licenses-client.tsx): decrypted server-side and audit-logged on every
  // fetch, kept only in this component's memory, and discarded (not just
  // hidden) when toggled off — so confirming a customer's key over the
  // phone always goes through a fresh, freshly-logged decrypt, never a
  // cached plaintext copy sitting in state after the admin moved on.
  const [revealedSerials, setRevealedSerials] = useState<Map<number, string>>(new Map());
  const [revealingId, setRevealingId] = useState<number | null>(null);

  async function toggleSerialVisibility(licenseId: number) {
    if (revealedSerials.has(licenseId)) {
      setRevealedSerials((prev) => {
        const next = new Map(prev);
        next.delete(licenseId);
        return next;
      });
      return;
    }
    setRevealingId(licenseId);
    const result = await apiPatch<{ serial: string }>(`/api/admin/licenses/${licenseId}`, { action: "reveal" });
    setRevealingId(null);
    if (!result.ok) {
      toast.error("Could not recover the full serial", { description: result.error === "not_recoverable" ? "This license was generated before this feature existed — no recoverable copy." : result.error });
      return;
    }
    setRevealedSerials((prev) => new Map(prev).set(licenseId, result.data.serial));
  }

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

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!profileId) {
        setNotes([]);
        return;
      }
      apiFetch<{ notes: AdminNote[] }>(`/api/admin/users/${encodeURIComponent(profileId)}/notes`).then((result) => {
        if (cancelled) return;
        if (result.ok) setNotes(result.data.notes);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profileId, notesReloadToken]);

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
  const rankState = data ? computeRank({ activeLicenseCount: activeLicenses, rankOverride: data.account.rankOverride }) : null;

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
                <div className="relative">
                  <Avatar size="lg" className="size-16 shrink-0 ring-2 ring-primary/30">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <UserIcon className="size-7" />
                    </AvatarFallback>
                  </Avatar>
                  {rankState ? (
                    <RankBadge
                      rankId={rankState.rank.id}
                      size="sm"
                      className="absolute -bottom-1.5 -right-1.5 drop-shadow-md"
                    />
                  ) : null}
                </div>
                <div className="font-mono text-sm text-foreground">{data.account.id}</div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Badge variant={data.account.status === "blocked" ? "destructive" : "outline"} className={data.account.status === "blocked" ? "" : "border-emerald-900/60 bg-emerald-950/70 text-emerald-400"}>
                    {data.account.status === "blocked" ? "Blocked" : "Active"}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5" title={formatDate(data.account.lastSeenAt)}>
                    <span className={cn("size-1.5 rounded-full", PRESENCE_DOT[data.account.presence] ?? PRESENCE_DOT.offline)} />
                    {data.account.presence === "offline"
                      ? `Offline · left ${formatRelativeTime(data.account.lastSeenAt)}`
                      : PRESENCE_LABEL[data.account.presence] ?? data.account.presence}
                  </Badge>
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                    {rankState ? rankState.rank.name.pt : data.gamification.levelName} · Level {data.gamification.level}
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
                    {data.licenses.map((license) => {
                      const fullSerial = revealedSerials.get(license.id);
                      const revealed = Boolean(fullSerial);
                      const revealing = revealingId === license.id;
                      return (
                      <li key={license.id} className="rounded-lg border bg-card/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{license.material.name}</div>
                          <LicenseStatusBadge status={license.status} />
                        </div>
                        <div className="mt-1.5 flex w-fit items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-mono text-xs text-muted-foreground">
                          <Fingerprint className="size-3.5 shrink-0" /> {fullSerial ?? license.serial}
                          {canRevealSerial ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
                              onClick={() => void toggleSerialVisibility(license.id)}
                              disabled={revealing}
                              title={revealed ? "Ocultar serial completo" : "Ver serial completo — confirme a chave com o cliente antes de agir (fica registrado no log de auditoria)"}
                            >
                              {revealing ? <Spinner className="size-3.5" /> : revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </Button>
                          ) : null}
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <div><dt className="inline font-medium text-foreground/70">Activated: </dt><dd className="inline">{formatDate(license.activatedAt)}</dd></div>
                          <div><dt className="inline font-medium text-foreground/70">Valid until: </dt><dd className="inline">{license.expiresAt ? formatDate(license.expiresAt) : "No expiry"}</dd></div>
                          <div><dt className="inline font-medium text-foreground/70">Lot: </dt><dd className="inline">{license.lot || "—"}</dd></div>
                          <div><dt className="inline font-medium text-foreground/70">Issued: </dt><dd className="inline">{formatDate(license.createdAt)}</dd></div>
                        </dl>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>Device &amp; access</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Linked device" value={data.device?.browser || "Not available"} />
                  <Field label="Device ID" value={data.device?.fingerprint ? <span className="font-mono">{data.device.fingerprint.slice(0, 12)}…</span> : "Not available"} />
                  <Field label="Approximate location" value={data.location ? formatLocation(data.location) || "—" : "—"} />
                  <Field label="Last known IP" value={<span className="font-mono">{data.lastKnownIp || "—"}</span>} />
                  <Field
                    label="Location permission"
                    value={
                      data.geoPermission
                        ? <span className={data.geoPermission.status === "denied" ? "font-medium text-destructive" : undefined}>{GEO_PERMISSION_LABEL[data.geoPermission.status] ?? data.geoPermission.status}</span>
                        : "Not reported"
                    }
                  />
                  {data.geoPermission?.status === "granted" && data.geoPermission.latitude != null && data.geoPermission.longitude != null ? (
                    <Field
                      label="Precise location"
                      value={<span className="font-mono">{data.geoPermission.latitude.toFixed(4)}, {data.geoPermission.longitude.toFixed(4)}</span>}
                    />
                  ) : null}
                  <Field label="Language" value={data.account.preferredLanguage || "—"} />
                  <Field label="First seen" value={formatDate(data.account.createdAt)} />
                  <Field
                    label="Last seen"
                    value={<span title={formatDate(data.account.lastSeenAt ?? data.account.lastActivity)}>{formatRelativeTime(data.account.lastSeenAt ?? data.account.lastActivity)}</span>}
                  />
                </div>
                {data.geoPermission?.status === "denied" ? (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    <MapPinOff className="size-4 shrink-0" />
                    <span>This customer denied the browser&apos;s location permission on {formatDate(data.geoPermission.reportedAt)}.</span>
                  </div>
                ) : data.geoPermission?.status === "granted" ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                    <MapPin className="size-4 shrink-0" />
                    <span>Location permission granted on {formatDate(data.geoPermission.reportedAt)}.</span>
                  </div>
                ) : null}
                {data.sameDeviceProfiles.length > 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                    <div className="font-medium">Same device also seen on {data.sameDeviceProfiles.length} other profile{data.sameDeviceProfiles.length > 1 ? "s" : ""}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 font-mono">
                      {data.sameDeviceProfiles.map((profileId) => <span key={profileId}>{profileId}</span>)}
                    </div>
                  </div>
                ) : null}
              </section>

              <NotesSection profileId={data.account.id} notes={notes} onAdded={() => setNotesReloadToken((n) => n + 1)} />

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

/**
 * Notes are visible to every admin who can open this profile (same
 * admin.users.inspect bar as the inspector itself) — not gated behind
 * canManageProfiles, since leaving/reading a note is not the same
 * authorization as editing gamification fields.
 */
function NotesSection({ profileId, notes, onAdded }: { profileId: string; notes: AdminNote[]; onAdded: () => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function addNote() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    const result = await apiPost<{ note: AdminNote }>(`/api/admin/users/${encodeURIComponent(profileId)}/notes`, { body });
    setSaving(false);
    if (!result.ok) {
      toast.error("Could not save note", { description: result.error });
      return;
    }
    setDraft("");
    onAdded();
  }

  return (
    <section className="space-y-2">
      <SectionTitle>Admin notes</SectionTitle>
      <div className="space-y-2">
        <Textarea
          placeholder="Leave a note for other admins about this customer…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={4000}
        />
        <Button size="sm" className="gap-1.5" onClick={() => void addNote()} disabled={saving || !draft.trim()}>
          <NotebookPen className="size-3.5" /> {saving ? "Saving…" : "Add note"}
        </Button>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border bg-card/60 p-3 text-sm">
              <p className="whitespace-pre-wrap break-words">{note.body}</p>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {note.adminUsername} · {formatDate(note.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
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
