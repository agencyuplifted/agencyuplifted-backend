import { getAktuellerBenutzer } from "@/lib/auth";
import Sidebar from "../Sidebar";

// Layout fuer den gesamten authentifizierten Admin-Bereich (alles ausser
// /login und den oeffentlichen /wissen-Seiten). Vorher lag dieser Wrapper im
// Root-Layout und hat faelschlich auch /login und /oeffentlich (jetzt
// /wissen) in die Sidebar gepackt.
export default async function BackstageLayout({ children }: { children: React.ReactNode }) {
  const benutzer = await getAktuellerBenutzer();

  return (
    <div className="au-app">
      <Sidebar benutzerName={benutzer?.name} />
      <div className="au-main">
        <div className="au-container">{children}</div>
      </div>
    </div>
  );
}
