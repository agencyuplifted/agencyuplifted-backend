import { requireMitglied } from "@/lib/netzwerk";
import { speichereNetzwerkProfil } from "@/lib/netzwerk-actions";
import NetzwerkFormular from "../../NetzwerkFormular";

export const metadata = { title: "Mein Profil" };

export default async function EinstellungenPage() {
  const { client, teilnehmerId } = await requireMitglied();
  const { data: p, error } = await client
    .from("teilnehmer")
    .select("vorname, nachname, email, position, telefon, mobiltelefon, linkedin_url, netzwerk_sichtbar, netzwerk_spezialisierungen, netzwerk_standort, netzwerk_kurzprofil")
    .eq("id", teilnehmerId)
    .single();
  if (error) throw new Error(error.message);

  return (
    <main>
      <h1>Mein Profil</h1>
      <div className="ua-karte" style={{ maxWidth: 680 }}>
        <NetzwerkFormular action={speichereNetzwerkProfil}>
          <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", marginBottom: "1.1rem", fontSize: "0.95rem" }}>
            <input type="checkbox" name="netzwerk_sichtbar" defaultChecked={p.netzwerk_sichtbar} style={{ marginTop: "0.25rem" }} />
            <span>
              <strong>Im Netzwerk sichtbar</strong>
              <span className="ua-klein" style={{ display: "block" }}>
                Wenn ausgeschaltet, sehen dich andere Mitglieder nicht im Verzeichnis, in Gesuchen oder als Verbindung. Du selbst kannst weiter alles nutzen.
              </span>
            </span>
          </label>
          <p className="ua-klein" style={{ marginTop: 0 }}>{p.vorname} {p.nachname} · {p.email} (Name und E-Mail ändert Markus für dich)</p>
          <label className="au-label">Position</label>
          <input className="au-input" name="position" defaultValue={p.position || ""} placeholder="z. B. Geschäftsführer" />
          <label className="au-label">Kurzprofil</label>
          <textarea className="au-textarea" name="netzwerk_kurzprofil" rows={4} maxLength={1500} defaultValue={p.netzwerk_kurzprofil || ""} placeholder="Wofür steht deine Agentur, wobei kann man dich ansprechen?" />
          <label className="au-label">Spezialisierungen (mit Komma getrennt)</label>
          <input className="au-input" name="netzwerk_spezialisierungen" defaultValue={(p.netzwerk_spezialisierungen || []).join(", ")} placeholder="z. B. Shopware, B2B-E-Commerce, UX" />
          <label className="au-label">Standort</label>
          <input className="au-input" name="netzwerk_standort" defaultValue={p.netzwerk_standort || ""} placeholder="leer = Ort deiner Agentur" />
          <label className="au-label">Mobil (für WhatsApp)</label>
          <input className="au-input" name="mobiltelefon" defaultValue={p.mobiltelefon || ""} />
          <label className="au-label">Telefon</label>
          <input className="au-input" name="telefon" defaultValue={p.telefon || ""} />
          <label className="au-label">LinkedIn</label>
          <input className="au-input" name="linkedin_url" type="url" defaultValue={p.linkedin_url || ""} placeholder="https://www.linkedin.com/in/…" />
          <button type="submit" className="au-btn au-btn-primary">Speichern</button>
        </NetzwerkFormular>
      </div>
    </main>
  );
}
