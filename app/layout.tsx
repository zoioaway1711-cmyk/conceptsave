import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Save Concept — Verificação de Autenticidade",
  description: "Portal Save Concept para verificação de seriais, benefícios e gestão segura de perfis.",
  metadataBase: new URL("https://conceptsave.vercel.app"),
  openGraph: {
    title: "Save Concept — Portal de Autenticidade",
    description: "Verifique o serial e acompanhe seus produtos Save Concept.",
    siteName: "Save Concept", type: "website", locale: "pt_PT",
    url: "/index.html",
    images: [{ url: "/save-concept-share.png", width: 1200, height: 630, alt: "Save Concept — Portal de Autenticidade" }],
  },
  twitter: { card: "summary_large_image", images: ["/save-concept-share.png"] },
  icons: {
    icon: "/save-concept-favicon.png",
    shortcut: "/save-concept-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body className="antialiased">{children}</body>
    </html>
  );
}
