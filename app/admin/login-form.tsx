"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect username or password.",
  admin_environment_not_configured: "The admin environment isn't configured yet. Contact an operator.",
  invalid_body: "Please fill in both fields.",
  invalid_origin: "Request blocked (invalid origin). Please reload the page and try again.",
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
        setError(retryAfter > 0 ? `Too many attempts. Try again in ${retryAfter}s.` : "Too many attempts. Please wait and try again.");
        return;
      }
      let data: { authenticated?: boolean; error?: string } = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      if (!response.ok || !data.authenticated) {
        setError(ERROR_MESSAGES[data.error ?? ""] ?? "Could not sign in. Please try again.");
        return;
      }
      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Admin Console</CardTitle>
          <CardDescription>Sign in to manage materials, licenses and security.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="admin-user">Username</Label>
              <Input id="admin-user" name="user" autoComplete="username" required value={user} onChange={(event) => setUser(event.target.value)} disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input id="admin-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
