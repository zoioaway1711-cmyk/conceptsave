"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import type { Permission } from "@/lib/permissions";
import { apiFetch, apiPatch, apiPost } from "../_lib/api";
import { ALL_PERMISSIONS, PERMISSION_LABELS } from "./permission-descriptions";

type AdminRow = { id: string; username: string; permissions: Permission[]; disabled: boolean; createdAt: string; lastLoginAt: string | null };

export function AdminsClient({ currentAdminId }: { currentAdminId: string }) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiFetch<{ admins: AdminRow[] }>("/api/admin/admins");
    if (result.ok) setAdmins(result.data.admins ?? []);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggleDisabled(admin: AdminRow) {
    if (admin.id === currentAdminId && !admin.disabled) {
      toast.error("You can't disable your own account.");
      return;
    }
    const result = await apiPatch<{ saved: true }>("/api/admin/admins", { id: admin.id, disabled: !admin.disabled });
    if (!result.ok) {
      toast.error("Could not update admin", { description: result.error });
      return;
    }
    setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, disabled: !a.disabled } : a)));
    toast.success(admin.disabled ? "Admin re-enabled" : "Admin disabled");
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admins</h1>
          <p className="text-sm text-muted-foreground">Manage admin accounts and their permissions (RBAC).</p>
        </div>
        <CreateAdminDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(admin) => {
            setAdmins((prev) => [...prev, admin]);
            setCreateOpen(false);
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All admins</CardTitle>
          <CardDescription>{admins.length} admin account{admins.length === 1 ? "" : "s"}.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
          ) : error ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Could not load admins</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => void load()}>Retry</Button>
            </Empty>
          ) : admins.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Users /></EmptyMedia>
                <EmptyTitle>No admins yet</EmptyTitle>
                <EmptyDescription>Create the first admin account.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      {admin.username} {admin.id === currentAdminId ? <Badge variant="secondary" className="ml-2">You</Badge> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {admin.permissions.length === 0 ? <span className="text-xs text-muted-foreground">None</span> : admin.permissions.map((permission) => (
                          <Badge key={permission} variant="outline" className="text-[10px]">{PERMISSION_LABELS[permission]?.label ?? permission}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : "Never"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(admin.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Switch checked={!admin.disabled} onCheckedChange={() => void toggleDisabled(admin)} disabled={admin.id === currentAdminId && !admin.disabled} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setEditing(admin)}>Edit permissions</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditPermissionsSheet
        admin={editing}
        onClose={() => setEditing(null)}
        onSaved={(id, permissions) => {
          setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, permissions } : a)));
          setEditing(null);
        }}
      />
    </div>
  );
}

function PermissionChecklist({ selected, onChange }: { selected: Permission[]; onChange: (next: Permission[]) => void }) {
  function toggle(permission: Permission, checked: boolean) {
    onChange(checked ? [...selected, permission] : selected.filter((p) => p !== permission));
  }
  return (
    <div className="space-y-2">
      {ALL_PERMISSIONS.map((permission) => {
        const meta = PERMISSION_LABELS[permission];
        const checked = selected.includes(permission);
        return (
          <label key={permission} className="flex items-start gap-3 rounded-md border p-2.5 text-sm">
            <Checkbox checked={checked} onCheckedChange={(value) => toggle(permission, Boolean(value))} className="mt-0.5" />
            <span>
              <span className="block font-medium">{meta.label}</span>
              <span className="block text-xs text-muted-foreground">{meta.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function CreateAdminDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (admin: AdminRow) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setUsername("");
    setPassword("");
    setPermissions([]);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await apiPost<{ admin: AdminRow }>("/api/admin/admins", { username, password, permissions });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error === "username_taken" ? "That username is already taken." : result.error);
      return;
    }
    toast.success("Admin created");
    onCreated(result.data.admin);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> New admin</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New admin account</DialogTitle>
            <DialogDescription>Grant only the permissions this admin actually needs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-username">Username</Label>
              <Input id="admin-username" required minLength={3} maxLength={60} value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-new-password">Password</Label>
              <Input id="admin-new-password" type="password" required minLength={12} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} />
              <p className="text-xs text-muted-foreground">Minimum 12 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Permissions</Label>
              <PermissionChecklist selected={permissions} onChange={setPermissions} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create admin"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPermissionsSheet({ admin, onClose, onSaved }: { admin: AdminRow | null; onClose: () => void; onSaved: (id: string, permissions: Permission[]) => void }) {
  return (
    <Sheet open={Boolean(admin)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {/* Keyed by admin.id so switching the edited admin remounts with fresh local state instead of syncing via an effect. */}
        {admin ? <EditPermissionsForm key={admin.id} admin={admin} onSaved={onSaved} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function EditPermissionsForm({ admin, onSaved }: { admin: AdminRow; onSaved: (id: string, permissions: Permission[]) => void }) {
  const [permissions, setPermissions] = useState<Permission[]>(admin.permissions);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await apiPatch<{ saved: true }>("/api/admin/admins", { id: admin.id, permissions });
    setSaving(false);
    if (!result.ok) {
      toast.error("Could not save permissions", { description: result.error });
      return;
    }
    toast.success("Permissions updated");
    onSaved(admin.id, permissions);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> {admin.username}</SheetTitle>
        <SheetDescription>Edit this admin&apos;s permissions.</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4">
        <PermissionChecklist selected={permissions} onChange={setPermissions} />
      </div>
      <SheetFooter>
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save permissions"}</Button>
      </SheetFooter>
    </>
  );
}
