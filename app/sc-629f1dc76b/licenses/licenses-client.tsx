"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Pencil, Plus, RefreshCw, Search, Ticket, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { LicenseStatusBadge } from "../_components/license-status-badge";
import { apiFetch, apiPatch, apiPost } from "../_lib/api";
import { UserInspector } from "../live/user-inspector";
import { looksMasked } from "../live/format";
import { RevealSerialDialog } from "./reveal-dialog";
import { downloadCsv } from "../_lib/csv";

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

export function LicensesClient({ initialMaterialId, canInspectUsers, canManageProfiles, canRevealSerial }: { initialMaterialId: string | null; canInspectUsers: boolean; canManageProfiles: boolean; canRevealSerial: boolean }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string>(initialMaterialId ?? "");
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealSerial, setRevealSerial] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [editing, setEditing] = useState<License | null>(null);
  const [activationFilter, setActivationFilter] = useState<"all" | "generated" | "activated">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired" | "revoked">("all");
  const [lotQuery, setLotQuery] = useState("");
  const [activatedFrom, setActivatedFrom] = useState("");
  const [activatedTo, setActivatedTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRevoking, setBulkRevoking] = useState(false);
  // Full serials fetched on demand via the "reveal" action — decrypted
  // server-side and audit-logged on every fetch. Kept only in memory,
  // discarded (not just hidden) when the eye is toggled off again, so
  // re-revealing always goes through a fresh, freshly-logged decrypt.
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
      toast.error("Não foi possível recuperar o serial completo", { description: result.error === "not_recoverable" ? "Esta licença foi gerada antes desse recurso existir — não há cópia recuperável." : result.error });
      return;
    }
    setRevealedSerials((prev) => new Map(prev).set(licenseId, result.data.serial));
  }

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

  // "Generated" = minted but never claimed/activated by a customer yet
  // (activatedAt is null). "Activated" = a customer has redeemed it.
  // Revoked/expired licenses show up under whichever bucket they were in
  // before that happened, same as the underlying activatedAt fact.
  const filteredLicenses = useMemo(() => {
    const lotTerm = lotQuery.trim().toLowerCase();
    const fromTime = activatedFrom ? new Date(activatedFrom).getTime() : null;
    // Inclusive end-of-day, so picking the same day for "from" and "to" doesn't exclude everything activated that day.
    const toTime = activatedTo ? new Date(activatedTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return licenses.filter((license) => {
      if (activationFilter === "generated" && license.activatedAt) return false;
      if (activationFilter === "activated" && !license.activatedAt) return false;
      if (statusFilter !== "all" && license.status !== statusFilter) return false;
      if (lotTerm && !license.lot.toLowerCase().includes(lotTerm)) return false;
      if (fromTime !== null || toTime !== null) {
        if (!license.activatedAt) return false;
        const activatedTime = new Date(license.activatedAt).getTime();
        if (fromTime !== null && activatedTime < fromTime) return false;
        if (toTime !== null && activatedTime > toTime) return false;
      }
      return true;
    });
  }, [licenses, activationFilter, statusFilter, lotQuery, activatedFrom, activatedTo]);

  // Selection is keyed by id, but clamped to what's currently visible —
  // switching material/filters never leaves a stale, invisible license
  // silently included in the next bulk action.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedIds((prev) => {
        const visible = new Set(filteredLicenses.map((l) => l.id));
        const next = new Set([...prev].filter((id) => visible.has(id)));
        return next.size === prev.size ? prev : next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filteredLicenses]);

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === filteredLicenses.length ? new Set() : new Set(filteredLicenses.map((l) => l.id))));
  }

  function exportCsv() {
    downloadCsv(`licencas-${selectedMaterial?.slug ?? materialId}-${new Date().toISOString().slice(0, 10)}.csv`, filteredLicenses.map((license) => ({
      id: license.id,
      serial: revealedSerials.get(license.id) ?? license.serial,
      lote: license.lot,
      status: license.status,
      dono: license.ownerProfileId ?? "",
      ativada_em: license.activatedAt ?? "",
      expira_em: license.expiresAt ?? "",
      criada_em: license.createdAt,
    })));
  }

  async function bulkRevoke() {
    setBulkRevoking(true);
    const ids = [...selectedIds].filter((id) => licenses.find((l) => l.id === id)?.status === "active");
    let succeeded = 0;
    for (const id of ids) {
      const result = await apiPatch<{ revoked: true }>(`/api/admin/licenses/${id}`, { action: "revoke" });
      if (result.ok) succeeded++;
    }
    setBulkRevoking(false);
    setSelectedIds(new Set());
    if (succeeded > 0) {
      setLicenses((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, status: "revoked" } : l)));
      toast.success(`${succeeded} licença${succeeded === 1 ? "" : "s"} revogada${succeeded === 1 ? "" : "s"}`);
    }
    if (succeeded < ids.length) toast.error(`${ids.length - succeeded} não puderam ser revogadas`);
  }

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
            <CardDescription>{filteredLicenses.length} of {licenses.length} license{licenses.length === 1 ? "" : "s"} shown.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={filteredLicenses.length === 0}>
              <Download className="size-4" /> Exportar CSV
            </Button>
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
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {materialId ? (
            <>
              <Tabs value={activationFilter} onValueChange={(value) => setActivationFilter(value as typeof activationFilter)} className="mb-4">
                <TabsList>
                  <TabsTrigger value="all">Todas</TabsTrigger>
                  <TabsTrigger value="generated">Geradas</TabsTrigger>
                  <TabsTrigger value="activated">Ativadas</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Ativa</SelectItem>
                      <SelectItem value="expired">Expirada</SelectItem>
                      <SelectItem value="revoked">Revogada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lot-filter">Lote</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input id="lot-filter" className="w-36 pl-7" value={lotQuery} onChange={(event) => setLotQuery(event.target.value)} placeholder="Buscar lote…" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activated-from">Ativada de</Label>
                  <Input id="activated-from" type="date" className="w-40" value={activatedFrom} onChange={(event) => setActivatedFrom(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activated-to">até</Label>
                  <Input id="activated-to" type="date" className="w-40" value={activatedTo} onChange={(event) => setActivatedTo(event.target.value)} />
                </div>
                {statusFilter !== "all" || lotQuery || activatedFrom || activatedTo ? (
                  <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setLotQuery(""); setActivatedFrom(""); setActivatedTo(""); }}>
                    Limpar filtros
                  </Button>
                ) : null}
              </div>
              {selectedIds.size > 0 ? (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="text-sm font-medium">{selectedIds.size} selecionada{selectedIds.size === 1 ? "" : "s"}</span>
                  <div className="flex items-center gap-2">
                    <ConfirmActionDialog
                      triggerLabel={`Revogar selecionadas (${selectedIds.size})`}
                      triggerIcon={Trash2}
                      title="Revogar as licenças selecionadas?"
                      description="Todas as licenças selecionadas (ativas) deixam de funcionar imediatamente. Isso não pode ser desfeito."
                      confirmLabel="Revogar selecionadas"
                      destructive
                      onConfirm={bulkRevoke}
                      disabled={bulkRevoking}
                    />
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Limpar seleção</Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
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
          ) : filteredLicenses.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Ticket /></EmptyMedia>
                <EmptyTitle>Nothing in this filter</EmptyTitle>
                <EmptyDescription>No licenses match the current filters — try clearing status/lot/date above.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={selectedIds.size > 0 && selectedIds.size === filteredLicenses.length} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Activated</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLicenses.map((license) => {
                  const fullSerial = revealedSerials.get(license.id);
                  const revealed = Boolean(fullSerial);
                  const revealing = revealingId === license.id;
                  return (
                  <TableRow key={license.id} data-state={selectedIds.has(license.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(license.id)} onCheckedChange={() => toggleSelected(license.id)} aria-label={`Select license ${license.id}`} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{fullSerial ?? license.serial}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => void toggleSerialVisibility(license.id)}
                          disabled={revealing}
                          title={revealed ? "Ocultar serial completo" : "Ver serial completo (fica registrado no log de auditoria)"}
                        >
                          {revealing ? <Spinner className="size-3.5" /> : revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{license.lot || "—"}</TableCell>
                    <TableCell><LicenseStatusBadge status={license.status} /></TableCell>
                    <TableCell className="font-mono text-xs">
                      {license.ownerProfileId ? (
                        canInspectUsers && !looksMasked(license.ownerProfileId) ? (
                          <button
                            type="button"
                            onClick={() => setInspecting(license.ownerProfileId)}
                            className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                            title="View everything recorded about this person"
                          >
                            {license.ownerProfileId}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{license.ownerProfileId}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">Unclaimed</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{license.activatedAt ? new Date(license.activatedAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : "Never"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(license.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(license)} disabled={license.status === "revoked"}>
                          <Pencil className="size-4" /> Edit
                        </Button>
                        <ConfirmActionDialog
                          triggerLabel="Replace & resend"
                          title="Replace this license?"
                          description="This revokes the current code and issues a brand-new one, transferring the same ownership. The old serial can never be recovered — but the new one will be shown right after, ready to copy and resend to the customer if something went wrong with the original."
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RevealSerialDialog serial={revealSerial} onClose={() => setRevealSerial(null)} />
      <UserInspector profileId={inspecting} canManageProfiles={canManageProfiles} canRevealSerial={canRevealSerial} onClose={() => setInspecting(null)} />
      <EditLicenseDialog
        license={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void loadLicenses(materialId);
        }}
      />
    </div>
  );
}

function EditLicenseDialog({ license, onClose, onSaved }: { license: License | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={Boolean(license)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {license ? <EditLicenseForm key={license.id} license={license} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditLicenseForm({ license, onSaved }: { license: License; onSaved: () => void }) {
  const [lot, setLot] = useState(license.lot);
  const [expiresAt, setExpiresAt] = useState(license.expiresAt ? new Date(license.expiresAt).toISOString().slice(0, 16) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await apiPatch(`/api/admin/licenses/${license.id}`, {
      action: "update",
      lot,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("License updated");
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit license</DialogTitle>
        <DialogDescription>{license.serial} — the serial itself can never be edited, only reissued via Replace.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-license-lot">Lot</Label>
          <Input id="edit-license-lot" maxLength={80} value={lot} onChange={(event) => setLot(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-license-expires">Expires at</Label>
          <Input id="edit-license-expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          <p className="text-xs text-muted-foreground">Leave blank for a license that never expires.</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</Button>
      </DialogFooter>
    </form>
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
