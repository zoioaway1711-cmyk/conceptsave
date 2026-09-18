"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Package, Plus, Search, Ticket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, apiPost } from "../_lib/api";

type Material = { id: number; slug: string; prefixCode: string; name: string; maker: string; brand: string; archived: boolean; createdAt: string };

export function MaterialsClient() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiFetch<{ materials: Material[] }>("/api/admin/materials");
    if (result.ok) setMaterials(result.data.materials ?? []);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return materials;
    return materials.filter((m) => [m.name, m.prefixCode, m.maker, m.brand, m.slug].some((v) => v.toLowerCase().includes(term)));
  }, [materials, query]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Materials</h1>
          <p className="text-sm text-muted-foreground">Materials are what licenses are minted for — a course, a SKU, a content pack.</p>
        </div>
        <NewMaterialDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={(material) => {
            setMaterials((prev) => [material, ...prev]);
            setDialogOpen(false);
          }}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 border-b [.border-b]:pb-4">
          <div>
            <CardTitle>All materials</CardTitle>
            <CardDescription>{materials.length} material{materials.length === 1 ? "" : "s"} registered.</CardDescription>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search materials…" className="w-56 pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
          ) : error ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Could not load materials</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => void load()}>Retry</Button>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Package /></EmptyMedia>
                <EmptyTitle>No materials found</EmptyTitle>
                <EmptyDescription>{materials.length === 0 ? "No materials yet. Create the first one to start minting licenses." : "No materials match your search."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Maker</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Licenses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-mono">{material.prefixCode}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{material.maker || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{material.brand || "—"}</TableCell>
                    <TableCell>{material.archived ? <Badge variant="outline">Archived</Badge> : <Badge variant="outline" className="border-emerald-900/60 bg-emerald-950/70 text-emerald-400">Active</Badge>}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(material.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/licenses?materialId=${material.id}`}>
                          <Ticket className="size-4" /> Manage licenses
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewMaterialDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (material: Material) => void }) {
  const [name, setName] = useState("");
  const [prefixCode, setPrefixCode] = useState("");
  const [maker, setMaker] = useState("");
  const [brand, setBrand] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setPrefixCode("");
    setMaker("");
    setBrand("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await apiPost<{ material: Material }>("/api/admin/materials", { name, prefixCode, maker, brand });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error === "invalid_material" ? "Invalid prefix code or name — prefix must be 2-10 uppercase letters/digits." : result.error);
      return;
    }
    toast.success("Material created");
    onCreated(result.data.material);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> New material</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New material</DialogTitle>
            <DialogDescription>Materials group licenses — e.g. a course, drug SKU, or content pack.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="material-name">Name</Label>
              <Input id="material-name" required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Curso A" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material-prefix">Prefix code</Label>
              <Input id="material-prefix" required maxLength={10} value={prefixCode} onChange={(event) => setPrefixCode(event.target.value.toUpperCase())} placeholder="e.g. CURA" className="font-mono uppercase" />
              <p className="text-xs text-muted-foreground">2-10 uppercase letters/digits. For human identification only — it carries no authorization weight.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="material-maker">Maker (optional)</Label>
                <Input id="material-maker" maxLength={160} value={maker} onChange={(event) => setMaker(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="material-brand">Brand (optional)</Label>
                <Input id="material-brand" maxLength={160} value={brand} onChange={(event) => setBrand(event.target.value)} />
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create material"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
