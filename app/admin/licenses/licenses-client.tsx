"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Ticket, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { LicenseStatusBadge } from "../_components/license-status-badge";
import { apiFetch, apiPatch, apiPost } from "../_lib/api";
import { RevealSerialDialog } from "./reveal-dialog";

type Material = { id: number; slug: string; prefixCode: string; name: string; maker: string; brand: string; archived: boolean; createdAt: string };
type License = {
  id: number;
  material: { id: number; name: string; slug: string };
  serial: string;
  lot: string;
  status: "active" | "expired" | "revoked";
  ownerProfileId: string | null;
  expiresAt: string | null;
  createdAt: string;
  activatedAt: string | null;
};

export function LicensesClient({ initialMaterialId }: { initialMaterialId: string | null }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string>(initialMaterialId ?? "");
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealSerial, setRevealSerial] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await apiFetch<{ materials: Material[] }>("/api/admin/materials");
        if (result.ok) {
          setMaterials(result.data.materials ?? []);
          if (!materialId && result.data.materials?.length) setMaterialId(String(result.data.materials[0].id));
        } else {
          setMaterialsError(result.error);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLicenses = useCallback(async (id: string) => {
    if (!id || !Number.isInteger(Number(id)) || Number(id) <= 0) {
      setLicenses([]);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await apiFetch<{ licenses: License[] }>(`/api/admin/licenses?materialId=${encodeURIComponent(id)}`);
    if (result.ok) setLicenses(result.data.licenses ?? []);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadLicenses(materialId); }, 0);
    return () => window.clearTimeout(timer);
  }, [materialId, loadLicenses]);

  const selectedMaterial = useMemo(() => materials.find((m) => String(m.id) === materialId) ?? null, [materials, materialId]);

  async function revoke(license: License) {
    const result = await apiPatch<{ revoked: true }>(`/api/admin/licenses/${license.id}`, { action: "revoke" });
    if (!result.ok) {
      toast.error("Could not revoke license", { description: result.error });
      return;
    }
    toast.success("License revoked");
    setLicenses((prev) => prev.map((l) => (l.id === license.id ? { ...l, status: "revoked" } : l)));
  }

  async function replace(license: License) {
    const result = await apiPatch<{ license: { id: number; serial: string } }>(`/api/admin/licenses/${license.id}`, { action: "replace" });
    if (!result.ok) {
      toast.error("Could not replace license", { description: result.error });
      return;
    }
    toast.success("License replaced");
    setRevealSerial(result.data.license.serial);
    void loadLicenses(materialId);
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Licenses</h1>
          <p className="text-sm text-muted-foreground">Mint, revoke and replace license serials for a material.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select material</CardTitle>
          <CardDescription>Licenses are always scoped to one material.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {materials.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Material</Label>
              <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Choose a material…" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((material) => (
                    <SelectItem key={material.id} value={String(material.id)}>{material.name} ({material.prefixCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="material-id-input">{materials.length > 0 ? "Or enter material ID" : "Material ID"}</Label>
            <Input id="material-id-input" className="w-40" type="number" min={1} value={materialId} onChange={(event) => setMaterialId(event.target.value)} placeholder="e.g. 1" />
          </div>
          <Button variant="outline" onClick={() => void loadLicenses(materialId)} disabled={!materialId}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
          {materialsError ? (
            <p className="w-full text-xs text-muted-foreground">Couldn&apos;t load the material picker ({materialsError}) — you can still manage licenses by entering a material ID directly.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 border-b [.border-b]:pb-4">
          <div>
            <CardTitle>{selectedMaterial ? selectedMaterial.name : materialId ? `Material #${materialId}` : "Licenses"}</CardTitle>
            <CardDescription>{licenses.length} license{licenses.length === 1 ? "" : "s"} loaded.</CardDescription>
          </div>
          <GenerateLicenseDialog
            open={generateOpen}
            onOpenChange={setGenerateOpen}
            materialId={materialId}
            onCreated={(serial) => {
              setRevealSerial(serial);
              setGenerateOpen(false);
              void loadLicenses(materialId);
            }}
          />
        </CardHeader>
        <CardContent className="pt-4">
          {!materialId ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Ticket /></EmptyMedia>
                <EmptyTitle>Pick a material</EmptyTitle>
                <EmptyDescription>Select or enter a material ID above to see its licenses.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : loading ? (
            <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
          ) : error ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Could not load licenses</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => void loadLicenses(materialId)}>Retry</Button>
            </Empty>
          ) : licenses.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Ticket /></EmptyMedia>
                <EmptyTitle>No licenses yet</EmptyTitle>
                <EmptyDescription>Generate the first license for this material.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((license) => (
                  <TableRow key={license.id}>
                    <TableCell className="font-mono text-xs">{license.serial}</TableCell>
                    <TableCell className="text-muted-foreground">{license.lot || "—"}</TableCell>
                    <TableCell><LicenseStatusBadge status={license.status} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{license.ownerProfileId ?? "Unclaimed"}</TableCell>
                    <TableCell className="text-muted-foreground">{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "Never"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(license.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <ConfirmActionDialog
                          triggerLabel="Replace"
                          title="Replace this license?"
                          description="This revokes the current code and issues a brand-new one, transferring the same ownership. The old serial can never be recovered."
                          confirmLabel="Replace license"
                          onConfirm={() => replace(license)}
                          disabled={license.status === "revoked"}
                        />
                        <ConfirmActionDialog
                          triggerLabel="Revoke"
                          triggerIcon={Trash2}
                          title="Revoke this license?"
                          description="The license will stop working immediately. This cannot be undone."
                          confirmLabel="Revoke license"
                          destructive
                          onConfirm={() => revoke(license)}
                          disabled={license.status !== "active"}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RevealSerialDialog serial={revealSerial} onClose={() => setRevealSerial(null)} />
    </div>
  );
}

function GenerateLicenseDialog({ open, onOpenChange, materialId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; materialId: string; onCreated: (serial: string) => void }) {
  const [lot, setLot] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await apiPost<{ license: { id: number; serial: string } }>("/api/admin/licenses", {
      materialId: Number(materialId),
      lot: lot || undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLot("");
    setExpiresAt("");
    onCreated(result.data.license.serial);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={!materialId}><Plus className="size-4" /> Generate license</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Generate license</DialogTitle>
            <DialogDescription>The plaintext serial will be shown exactly once after creation — copy it immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="license-lot">Lot (optional)</Label>
              <Input id="license-lot" maxLength={80} value={lot} onChange={(event) => setLot(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="license-expires">Expires at (optional)</Label>
              <Input id="license-expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
              <p className="text-xs text-muted-foreground">Leave blank for a license that never expires.</p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>{submitting ? "Generating…" : "Generate"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmActionDialog({ triggerLabel, triggerIcon: Icon, title, description, confirmLabel, onConfirm, destructive, disabled }: { triggerLabel: string; triggerIcon?: ComponentType<{ className?: string }>; title: string; description: string; confirmLabel: string; onConfirm: () => void | Promise<void>; destructive?: boolean; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className={destructive ? "text-destructive hover:text-destructive" : undefined}>
          {Icon ? <Icon className="size-4" /> : null}
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            disabled={busy}
            onClick={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
