export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { updateBuchVersand } from "@/lib/actions";
import KategorieUndStatusFelder from "./KategorieUndStatusFelder";

const GRUND_LABEL: Record<string, string> = {
  rezension: "Rezensionsexemplar",
  gratis: "Gratisexemplar",
};

export default async function BuchVersandBearbeitenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: eintrag } = await supabase.from("buch_versand").select("*").eq("id", id).single();
  if (!eintrag) notFound();

  const { data: empfaenger } = await supabase
    .from("buch_empfaenger")
    .select("typ, status, geburtsdatum, linkedin_url")
    .eq("buch_versand_id", id)
    .maybeSingle();

  const { data: kategorien } = await supabase.from("buch_kontakt_kategorien").select("id, name").order("name");

  return (
    <main>
      <h1>Buch-Kontakt bearbeiten</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Ursprünglich eingefügter Freitext:{" "}
        {eintrag.rohtext ? <em>„{eintrag.rohtext}“</em> : "—"}
      </p>

      <a href="/buch-versand" className="au-btn au-btn-secondary au-btn-sm" style={{ marginBottom: "1rem", display: "inline-block" }}>
        ← Zurück zu Buch-Versand
      </a>

      <div className="au-card" style={{ maxWidth: 640 }}>
        <form action={updateBuchVersand}>
          <input type="hidden" name="id" value={eintrag.id} />

          <div className="au-row-2">
            <div>
              <label className="au-label">Firma (optional)</label>
              <input className="au-input" type="text" name="firma" defaultValue={eintrag.firma || ""} />
            </div>
            <div>
              <label className="au-label">Name</label>
              <input className="au-input" type="text" name="name" required defaultValue={eintrag.name} />
            </div>
          </div>

          <label className="au-label">E-Mail (optional)</label>
          <input className="au-input" type="email" name="email" defaultValue={eintrag.email || ""} />

          <label className="au-label">Straße + Hausnummer</label>
          <input className="au-input" type="text" name="strasse" required defaultValue={eintrag.strasse} />

          <div className="au-row-3">
            <div>
              <label className="au-label">PLZ</label>
              <input className="au-input" type="text" name="plz" required defaultValue={eintrag.plz} />
            </div>
            <div>
              <label className="au-label">Ort</label>
              <input className="au-input" type="text" name="ort" required defaultValue={eintrag.ort} />
            </div>
            <div>
              <label className="au-label">Land</label>
              <input className="au-input" type="text" name="land" required defaultValue={eintrag.land} />
            </div>
          </div>

          <label className="au-label">Grund</label>
          <select className="au-select" name="grund" defaultValue={eintrag.grund}>
            <option value="rezension">{GRUND_LABEL.rezension}</option>
            <option value="gratis">{GRUND_LABEL.gratis}</option>
          </select>

          <KategorieUndStatusFelder
            kategorien={kategorien || []}
            initialTyp={empfaenger?.typ || ""}
            initialStatus={empfaenger?.status || null}
          />

          <div className="au-row-2">
            <div>
              <label className="au-label">Geburtstag (optional)</label>
              <input className="au-input" type="date" name="geburtsdatum" defaultValue={empfaenger?.geburtsdatum || ""} />
            </div>
            <div>
              <label className="au-label">LinkedIn-URL (optional)</label>
              <input className="au-input" type="text" name="linkedin_url" defaultValue={empfaenger?.linkedin_url || ""} placeholder="https://www.linkedin.com/in/…" />
            </div>
          </div>

          <button type="submit" className="au-btn au-btn-primary" style={{ marginTop: "1rem" }}>
            Änderungen speichern
          </button>
        </form>
      </div>
    </main>
  );
}
