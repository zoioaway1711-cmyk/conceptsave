"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { Ban, Search, ShieldCheck, Ticket, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, apiPost } from "../_lib/api";
import { UserInspector } from "../live/user-inspector";

type Profile = {
  id: string;
  firstSeen: string;
  lastActive: string;
  lastSeenAt: string | null;
  preferredLanguage: string;
  points: number;
  level: number;
  levelName: string;
  benefits: unknown[];
  consent: Record<string, unknown>;
  rankOverride: number;
  blocked: boolean;
  activeLicenses: number;
};

type Filter = "all" | "active" | "blocked";

export function DashboardClient({ canManageProfiles, canInspectUsers }: { canManageProfiles: boolean; canInspectUsers: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiFetch<{ profiles: Profile[] }>("/api/admin/dashboard");
    if (result.ok) {
      setProfiles(result.data.profiles ?? []);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (filter === "active" && profile.blocked) return false;
      if (filter === "blocked" && !profile.blocked) return false;
      if (term && !profile.id.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [profiles, query, filter]);

  const totals = useMemo(() => {
    const blocked = profiles.filter((p) => p.blocked).length;
    return {
      total: profiles.length,
      active: profiles.length - blocked,
      blocked,
      activeLicenses: profiles.reduce((sum, p) => sum + (p.activeLicenses ?? 0), 0),
    };
  }, [profiles]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Customer profiles, gamification and license ownership at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total profiles" value={totals.total} />
        <StatCard icon={ShieldCheck} label="Active" value={totals.active} />
        <StatCard icon={Ban} label="Blocked" value={totals.blocked} tone="destructive" />
        <StatCard icon={Ticket} label="Active licenses" value={totals.activeLicenses} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 border-b [.border-b]:pb-4">
          <div>
            <CardTitle>Profiles</CardTitle>
            <CardDescription>Search by profile id, or filter by status.</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search profile id…" className="w-56 pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="blocked">Blocked</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
          ) : error ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Could not load profiles</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => void load()}>Retry</Button>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Users /></EmptyMedia>
                <EmptyTitle>No profiles found</EmptyTitle>
                <EmptyDescription>{profiles.length === 0 ? "No customer profiles yet." : "No profiles match your search/filter."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profile</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Active licenses</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((profile) => (
                  <TableRow
                    key={profile.id}
                    className="cursor-pointer"
                    onClick={() => (canInspectUsers ? setInspecting(profile.id) : setSelected(profile))}
                  >
                    <TableCell className="font-mono text-xs">{profile.id}</TableCell>
                    <TableCell>{profile.levelName}</TableCell>
                    <TableCell>{profile.points}</TableCell>
                    <TableCell>{profile.activeLicenses}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(profile.lastActive)}</TableCell>
                    <TableCell>
                      {profile.blocked ? <Badge variant="destructive">Blocked</Badge> : <Badge variant="outline" className="border-emerald-900/60 bg-emerald-950/70 text-emerald-400">Active</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProfileDialog
        profile={selected}
        canManage={canManageProfiles}
        onClose={() => setSelected(null)}
        onSaved={(updated) => {
          setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setSelected(null);
        }}
      />

      <UserInspector
        profileId={inspecting}
        canManageProfiles={canManageProfiles}
        onClose={() => {
          setInspecting(null);
          void load();
        }}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: ComponentType<{ className?: string }>; label: string; value: number; tone?: "destructive" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-2">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function ProfileDialog({ profile, canManage, onClose, onSaved }: { profile: Profile | null; canManage: boolean; onClose: () => void; onSaved: (profile: Profile) => void }) {
  return (
    <Dialog open={Boolean(profile)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {/* Keyed by profile.id so switching to a different profile remounts the form (fresh local state from props) instead of syncing via an effect. */}
        {profile ? <ProfileForm key={profile.id} profile={profile} canManage={canManage} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({ profile, canManage, onSaved }: { profile: Profile; canManage: boolean; onSaved: (profile: Profile) => void }) {
  const [points, setPoints] = useState(profile.points);
  const [level, setLevel] = useState(profile.level);
  const [levelName, setLevelName] = useState(profile.levelName);
  const [rankOverride, setRankOverride] = useState(profile.rankOverride);
  const [blocked, setBlocked] = useState(profile.blocked);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await apiPost("/api/admin/profiles", { id: profile.id, points, level, levelName, rankOverride, blocked });
    setSaving(false);
    if (!result.ok) {
      toast.error("Could not save profile", { description: result.error });
      return;
    }
    toast.success("Profile updated");
    onSaved({ ...profile, points, level, levelName, rankOverride, blocked });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-mono text-sm">{profile.id}</DialogTitle>
        <DialogDescription>First seen {formatDate(profile.firstSeen)} · Language {profile.preferredLanguage}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Active licenses</div>
            <div className="text-lg font-semibold">{profile.activeLicenses}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Benefits</div>
            <div className="text-lg font-semibold">{profile.benefits?.length ?? 0}</div>
          </div>
        </div>

        {canManage ? (
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="points">Points</Label>
              <Input id="points" type="number" min={0} value={points} onChange={(event) => setPoints(Number(event.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="level">Level</Label>
                <Input id="level" type="number" min={1} max={5} value={level} onChange={(event) => setLevel(Number(event.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rankOverride">Rank override</Label>
                <Input id="rankOverride" type="number" min={0} max={5} value={rankOverride} onChange={(event) => setRankOverride(Number(event.target.value))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="levelName">Level name</Label>
              <Input id="levelName" maxLength={40} value={levelName} onChange={(event) => setLevelName(event.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Blocked</div>
                <div className="text-xs text-muted-foreground">Prevents this profile from redeeming or logging in.</div>
              </div>
              <Switch checked={blocked} onCheckedChange={setBlocked} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to edit profiles (admin.profiles.manage).</p>
        )}
      </div>
      {canManage ? (
        <DialogFooter>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      ) : null}
    </>
  );
}
