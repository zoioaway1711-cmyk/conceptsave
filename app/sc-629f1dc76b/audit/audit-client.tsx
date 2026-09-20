"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileClock, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "../_lib/api";

type AuditRecord = { id: number; actor: string; action: string; resource: string | null; resourceId: string | null; result: "success" | "failure"; ip: string; metadata: Record<string, unknown>; createdAt: string };

export function AuditClient() {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiFetch<{ records: AuditRecord[] }>("/api/admin/audit-logs");
    if (result.ok) setRecords(result.data.records ?? []);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return records.filter((record) => {
      if (resultFilter !== "all" && record.result !== resultFilter) return false;
      if (!term) return true;
      return [record.actor, record.action, record.resource, record.resourceId, record.ip].some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [records, query, resultFilter]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Admin-initiated actions — logins, license/material changes, profile edits. Distinct from the live customer-activity feed.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 border-b [.border-b]:pb-4">
          <div>
            <CardTitle>Records</CardTitle>
            <CardDescription>{records.length} record{records.length === 1 ? "" : "s"} (last 500).</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search actor, action, resource…" className="w-64 pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
          ) : error ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Could not load audit log</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => void load()}>Retry</Button>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileClock /></EmptyMedia>
                <EmptyTitle>No records found</EmptyTitle>
                <EmptyDescription>{records.length === 0 ? "No audit records yet." : "No records match your search/filter."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-muted-foreground">{new Date(record.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{record.actor}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-mono text-xs">{record.action}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{[record.resource, record.resourceId].filter(Boolean).join(" #")}</TableCell>
                    <TableCell>
                      {record.result === "success" ? (
                        <Badge variant="outline" className="border-emerald-900/60 bg-emerald-950/70 text-emerald-400">Success</Badge>
                      ) : (
                        <Badge variant="destructive">Failure</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{record.ip || "—"}</TableCell>
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
