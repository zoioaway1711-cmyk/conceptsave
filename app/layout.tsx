import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Save Concept — Verificação de Autenticidade",
  description: "Portal Save Concept para verificação de seriais, benefícios e gestão segura de perfis.",
  icons: {
    icon: "/save-concept-favicon.png",
    shortcut: "/save-concept-favicon.png",
    apple: "/save-concept-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        {/* globals.css sets body { font-family: "DM Sans", ... } but never
            fetches it — only public/index.html (the static legacy page)
            loaded this Google Fonts link, so every Next.js-rendered route
            (/loja, /admin, /clube-save, /usuarios) silently fell back to
            Arial instead of the intended DM Sans/Manrope pairing. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this
            rule targets the old Pages Router's per-page _document.js; the
            App Router's root layout is the correct place for a site-wide
            font link, exactly mirroring public/index.html's own tags. */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
