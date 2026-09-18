import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Save Concept — Verificação de Autenticidade",
  description: "Portal Save Concept para verificação de seriais, benefícios e gestão segura de perfis.",
  icons: {
    icon: "/app-icon.svg",
    shortcut: "/app-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
