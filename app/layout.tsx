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
      <body className="antialiased">{children}</body>
    </html>
  );
}
