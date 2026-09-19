import type { ReactNode } from "react";
import "./clube-save.css";

export const metadata = {
  title: "Clube SAVE — Save Concept",
  description: "Seu rank, sua jornada e suas premiações no Clube SAVE.",
};

export default function ClubeSaveLayout({ children }: { children: ReactNode }) {
  return (
    <div className="cs-theme">
      <div className="cs-ambient" aria-hidden="true" />
      {children}
    </div>
  );
}
