"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Ban,
  CircleCheck,
  Clock3,
  KeyRound,
  LogIn,
  LogOut,
  ShieldAlert,
  Ticket,
  UserCheck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiFetch } from "../_lib/api";
import { formatLocation, looksMasked } from "./format";
import { UserInspector } from "./user-inspector";

type Summary = { onlineUsers: number; idleUsers: number; activationsLast5Min: number; invalidAttemptsLast5Min: number; securityEventsLast5Min: number; generatedAt: string };
type LiveEvent = {
  id: number;
  type: string;
  severity: "info" | "warning" | "critical";
  actorProfileId: string | null;
  actorAdminId: string | null;
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
type Session = { profileId: string; presence: "online" | "idle" | "offline"; lastSeenAt: string; points: number; levelName: string; blocked: boolean };

type Filter = "ALL" | "ACTIVATIONS" | "INVALID" | "SECURITY";
type LiveWindow = "5m" | "30m" | "1h" | "24h";
type ConnState = "live" | "reconnecting" | "offline";

const EVENTS_INTERVAL = 4000;
const EVENTS_MAX_INTERVAL = 30000;
const SUMMARY_INTERVAL = 10000;
const SESSIONS_INTERVAL = 15000;
const MAX_EVENTS = 300;

const EVENT_META: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  USER_LOGIN: { label: "User login", icon: LogIn },
  USER_LOGOUT: { label: "User logout", icon: LogOut },
  LICENSE_CREATED: { label: "License created", icon: Ticket },
  LICENSE_ACTIVATED: { label: "License activated", icon: UserCheck },
  LICENSE_VALIDATED: { label: "License validated", icon: CircleCheck },
  LICENSE_REVOKED: { label: "License revoked", icon: Ban },
  LICENSE_EXPIRED: { label: "License expired", icon: Clock3 },
  INVALID_SERIAL: { label: "Invalid serial", icon: AlertTriangle },
  ACTIVATION_REJECTED: { label: "Activation rejected", icon: AlertTriangle },
  RATE_LIMITED: { label: "Rate limited", icon: ShieldAlert },
  SUSPICIOUS_ACTIVITY: { label: "Suspicious activity", icon: ShieldAlert },
  ADMIN_LOGIN: { label: "Admin login", icon: KeyRound },
  ADMIN_ACTION: { label: "Admin action", icon: Activity },
};

const SEVERITY_STYLES: Record<string, { ring: string; icon: string; badge: string }> = {
  info: { ring: "border-slate-800", icon: "bg-slate-800 text-slate-300", badge: "" },
  warning: { ring: "border-amber-500/40 bg-amber-500/5", icon: "bg-amber-500/15 text-amber-400", badge: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  critical: { ring: "border-red-500/50 bg-red-500/10", icon: "bg-red-500/20 text-red-400", badge: "border-red-500/50 bg-red-500/10 text-red-400" },
};

export function LiveClient({ canInspectUsers }: { canInspectUsers: boolean }) {
  const reduceMotion = useReducedMotion();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [windowParam, setWindowParam] = useState<LiveWindow>("30m");
  const [connState, setConnState] = useState<ConnState>("live");
  const [inspecting, setInspecting] = useState<string | null>(null);

  const cursorRef = useRef(0);
  const failuresRef = useRef(0);

  const openInspector = useCallback(
    (id: string | null | undefined) => {
      if (!canInspectUsers || !id || looksMasked(id)) return;
      setInspecting(id);
    },
    [canInspectUsers],
  );

  // Live event feed: cursor-based polling (id > since), with exponential
  // backoff on failure (4s -> 8s -> 16s -> 30s cap) driving the LIVE /
  // RECONNECTING / OFFLINE pill. filter/window changes reseed from scratch.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let delay = EVENTS_INTERVAL;

    async function tick() {
      const seed = cursorRef.current <= 0;
      const params = new URLSearchParams({ filter });
      if (seed) params.set("window", windowParam);
      else params.set("since", String(cursorRef.current));

      const result = await apiFetch<{ events: LiveEvent[]; cursor: number }>(`/api/admin/live/events?${params.toString()}`);
      if (cancelled) return;

      if (result.ok) {
        failuresRef.current = 0;
        setConnState("live");
        delay = EVENTS_INTERVAL;
        if (result.data.events.length) {
          setEvents((prev) => [...[...result.data.events].reverse(), ...prev].slice(0, MAX_EVENTS));
        }
        if (typeof result.data.cursor === "number" && result.data.cursor > 0) cursorRef.current = result.data.cursor;
      } else {
        failuresRef.current += 1;
        setConnState(failuresRef.current >= 3 ? "offline" : "reconnecting");
        delay = Math.min(delay * 2, EVENTS_MAX_INTERVAL);
      }
      if (!cancelled) timer = window.setTimeout(tick, delay);
    }

    cursorRef.current = 0;
    const seedTimer = window.setTimeout(() => {
      setEvents([]);
      void tick();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(seedTimer);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [filter, windowParam]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const result = await apiFetch<Summary>("/api/admin/live/summary");
      if (!cancelled && result.ok) setSummary(result.data);
    }
    void tick();
    const id = window.setInterval(() => void tick(), SUMMARY_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const result = await apiFetch<{ sessions: Session[] }>("/api/admin/live/sessions");
      if (!cancelled && result.ok) setSessions(result.data.sessions ?? []);
    }
    void tick();
    const id = window.setInterval(() => void tick(), SESSIONS_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-slate-50">LIVE INTELLIGENCE</h1>
          <p className="text-sm text-slate-400">Security operations · polled every few seconds</p>
        </div>
        <ConnectionPill state={connState} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="USERS ONLINE" value={summary?.onlineUsers ?? "—"} secondary={summary ? `${summary.idleUsers} idle` : undefined} />
        <StatCard label="ACTIVATIONS / 5 MIN" value={summary?.activationsLast5Min ?? "—"} />
        <StatCard label="INVALID ATTEMPTS / 5 MIN" value={summary?.invalidAttemptsLast5Min ?? "—"} tone="warning" />
        <StatCard label="SECURITY EVENTS / 5 MIN" value={summary?.securityEventsLast5Min ?? "—"} tone="critical" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList className="bg-slate-900">
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="ACTIVATIONS">Activations</TabsTrigger>
            <TabsTrigger value="INVALID">Invalid</TabsTrigger>
            <TabsTrigger value="SECURITY">Security</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={windowParam} onValueChange={(value) => setWindowParam(value as LiveWindow)}>
          <SelectTrigger className="w-32 border-slate-800 bg-slate-900 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5m">5 min</SelectItem>
            <SelectItem value="30m">30 min</SelectItem>
            <SelectItem value="1h">1 hour</SelectItem>
            <SelectItem value="24h">24 hours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="border-slate-800 bg-slate-900/60 text-slate-100 xl:col-span-2">
          <CardHeader className="border-b border-slate-800 [.border-b]:pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide text-slate-300">EVENT FEED</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto pt-4">
            {events.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">No live events yet.</p>
            ) : (
              <AnimatePresence initial={false}>
                {events.map((event) => (
                  <EventRow key={event.id} event={event} canInspectUsers={canInspectUsers} onInspect={openInspector} reduceMotion={Boolean(reduceMotion)} />
                ))}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
          <CardHeader className="border-b border-slate-800 [.border-b]:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-300">
              <Users className="size-4" /> ACTIVE SESSIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-1.5 overflow-y-auto pt-4">
            {sessions.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">No active sessions.</p>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.profileId}
                  type="button"
                  onClick={() => openInspector(session.profileId)}
                  disabled={!canInspectUsers || looksMasked(session.profileId)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-left text-xs transition-colors",
                    canInspectUsers && !looksMasked(session.profileId) ? "hover:border-slate-600 hover:bg-slate-800/60" : "cursor-default",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <PresenceDot presence={session.presence} />
                    <span className="font-mono">{session.profileId}</span>
                  </span>
                  <span className="text-right text-slate-400">
                    <span className="block">{session.levelName}</span>
                    <span className="block">{session.points} pts</span>
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <UserInspector profileId={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}

function ConnectionPill({ state }: { state: ConnState }) {
  const config = {
    live: { label: "● LIVE", classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
    reconnecting: { label: "● RECONNECTING", classes: "border-amber-500/40 bg-amber-500/10 text-amber-400", dot: "bg-amber-400" },
    offline: { label: "● OFFLINE", classes: "border-red-500/40 bg-red-500/10 text-red-400", dot: "bg-red-400" },
  }[state];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold tracking-widest", config.classes)}>
      <span className={cn("size-1.5 rounded-full", config.dot, state !== "offline" && "animate-pulse")} />
      {config.label}
    </span>
  );
}

function StatCard({ label, value, secondary, tone }: { label: string; value: number | string; secondary?: string; tone?: "warning" | "critical" }) {
  const valueTone = tone === "critical" ? "text-red-400" : tone === "warning" ? "text-amber-400" : "text-slate-50";
  return (
    <Card className="border-slate-800 bg-slate-900/60 text-slate-100">
      <CardContent className="py-3">
        <div className="text-[11px] font-medium tracking-widest text-slate-500">{label}</div>
        <div className={cn("mt-1 text-2xl font-bold tabular-nums", valueTone)}>{value}</div>
        {secondary ? <div className="mt-0.5 text-xs text-slate-500">{secondary}</div> : null}
      </CardContent>
    </Card>
  );
}

function PresenceDot({ presence }: { presence: string }) {
  const color = presence === "online" ? "bg-emerald-400" : presence === "idle" ? "bg-amber-400" : "bg-slate-600";
  return <span className={cn("size-2 rounded-full", color, presence === "online" && "animate-pulse")} />;
}

function EventRow({ event, canInspectUsers, onInspect, reduceMotion }: { event: LiveEvent; canInspectUsers: boolean; onInspect: (id: string | null | undefined) => void; reduceMotion: boolean }) {
  const meta = EVENT_META[event.type] ?? { label: event.type, icon: Activity };
  const Icon = meta.icon;
  const styles = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.info;
  const location = formatLocation(event);
  const actorClickable = canInspectUsers && event.actorProfileId && !looksMasked(event.actorProfileId);

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={cn("rounded-md border px-3 py-2 text-sm", styles.ring)}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", styles.icon)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="font-medium text-slate-100">{meta.label}</span>
            <span className="text-xs text-slate-500" title={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString()}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {event.materialId ? <span>Material #{event.materialId}</span> : null}
            {event.licenseId ? <span>License #{event.licenseId}</span> : null}
            {event.actorProfileId ? (
              actorClickable ? (
                <button type="button" onClick={() => onInspect(event.actorProfileId)} className="font-mono text-slate-300 underline decoration-dotted underline-offset-2 hover:text-slate-100">
                  {event.actorProfileId}
                </button>
              ) : (
                <span className="font-mono">{event.actorProfileId}</span>
              )
            ) : null}
            {event.actorAdminId ? <span>admin {event.actorAdminId}</span> : null}
            {event.reason ? <span className="italic">{event.reason}</span> : null}
            {event.ip ? <span className="font-mono">{event.ip}</span> : null}
            {location ? <span title="Approximate location">~ {location}</span> : null}
            {event.device ? <span>{event.device}</span> : null}
          </div>
        </div>
        {event.severity !== "info" ? (
          <Badge variant="outline" className={cn("shrink-0 uppercase", styles.badge)}>{event.severity}</Badge>
        ) : null}
      </div>
    </motion.div>
  );
}
