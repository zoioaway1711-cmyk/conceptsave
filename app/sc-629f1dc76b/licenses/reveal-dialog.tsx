"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The ONLY place a full plaintext serial is ever rendered. `serial` lives
 * purely in this component's own React state (owned by the parent, cleared
 * on close) — never persisted, never put in a URL, never logged. Closing
 * this dialog must make the plaintext unreachable again. The QR image is
 * rendered the same way — encoded fully client-side (no network call to any
 * QR-generation service), so the plaintext never leaves the browser.
 */
export function RevealSerialDialog({ serial, onClose }: { serial: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!serial) return;
    let cancelled = false;
    QRCode.toDataURL(serial, { margin: 1, width: 240 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; setQrDataUrl(null); };
  }, [serial]);

  async function copy() {
    if (!serial) return;
    try {
      await navigator.clipboard.writeText(serial);
      setCopied(true);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please select and copy manually.");
    }
  }

  return (
    <Dialog open={Boolean(serial)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>License serial — shown once</DialogTitle>
          <DialogDescription>Copy it now. It will never be shown again in the admin console.</DialogDescription>
        </DialogHeader>
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>This will never be shown again</AlertTitle>
          <AlertDescription>Once you close this dialog, only a masked version of this serial will ever be visible.</AlertDescription>
        </Alert>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4">
          <code className="flex-1 select-all break-all text-center font-mono text-lg font-semibold tracking-wide">{serial}</code>
        </div>
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/40 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated in-browser, next/image can't optimize it */}
            <img src={qrDataUrl} alt={`QR Code do serial ${serial}`} width={180} height={180} className="size-[180px]" />
            <p className="text-xs text-muted-foreground">Scan or print this QR Code on the product — it encodes the same serial above.</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy to clipboard"}
          </Button>
          <Button onClick={onClose}>Done — I&apos;ve copied it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
