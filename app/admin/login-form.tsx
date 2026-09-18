"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Usuário ou senha incorretos.",
  admin_environment_not_configured: "O ambiente administrativo ainda não foi configurado. Contate um operador.",
  invalid_body: "Preencha os dois campos.",
  invalid_origin: "Requisição bloqueada (origem inválida). Recarregue a página e tente novamente.",
};

export function LoginForm() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") || "0");
        setError(retryAfter > 0 ? `Muitas tentativas. Tente novamente em ${retryAfter}s.` : "Muitas tentativas. Aguarde e tente novamente.");
        return;
      }
      let data: { authenticated?: boolean; error?: string } = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      if (!response.ok || !data.authenticated) {
        setError(ERROR_MESSAGES[data.error ?? ""] ?? "Não foi possível entrar. Tente novamente.");
        return;
      }
      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Erro de rede. Verifique sua conexão e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm overflow-hidden">
        <div className="schematic-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <CardHeader className="relative items-center text-center">
          <Image src="/save-concept-mark-v2.png" alt="Save Concept" width={44} height={44} className="mb-1 h-11 w-auto object-contain" priority />
          <div className="mb-1 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.17em] text-primary">
            <ShieldCheck className="size-4" /> Área administrativa
          </div>
          <CardTitle className="text-xl">Painel VerificaFarma</CardTitle>
          <CardDescription>Entre para gerenciar materiais, licenças e segurança.</CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Falha ao entrar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="admin-user">Usuário</Label>
              <Input id="admin-user" name="user" autoComplete="username" required value={user} onChange={(event) => setUser(event.target.value)} disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Senha</Label>
              <Input id="admin-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
