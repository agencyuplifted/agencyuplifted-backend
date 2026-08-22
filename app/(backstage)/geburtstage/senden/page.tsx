export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendeGeburtstagsMail } from "@/lib/actions";
import { renderPlatzhalter } from "@/lib/funnel";
import { splitName } from "@/lib/format";
import SendenButton from "./SendenButton";

export default async function GeburtstagsMailSendenPage({
  searchParams,
}: {
  searchParams: Promise<{ quelle?: string; id?: string; vorlage_id?: string }>;
}) {
  const { quelle, id, vorlage_id } = await searchParams;
  if ((quelle !== "teilnehmer" && quelle !== "buch_empfaenger") || !id) notFound();

  const supabase = getSupabaseAdmin();

  let name = "";
  let email = "";
  let firma = "";

  if (quelle === "teilnehmer") {
    const { data: t } = await supabase.from("teilnehmer").select("vorname, nachname, email, firma_freitext").eq("id", id).single();
    if (!t) notFound();
    name = `${t.vorname} ${t.nachname}`.trim();
    email = t.email;
    firma = t.firma_freitext || "";
  } else {
    const { data: e } = await supabase.from("buch_empfaenger").select("name, email, firma").eq("id", id).single();
    if (!e || !e.email) notFound();
    name = e.name;
    email = e.email;
    firma = e.firma || "";
  }

  const { vorname, nachname } = splitName(name);
  const werte = { vorname, nachname, firma };

  const { data: vorlagen } = await supabase.from("geburtstags_vorlagen").select("*").order("ist_standard", { ascending: false }).order("name");
  const gewaehlteVorlage = vorlagen?.find((v) => v.id === vorlage_id) || vorlagen?.find((v) => v.ist_standard) || vorlagen?.[0];

  const betreffVorausgefuellt = gewaehlteVorlage ? renderPlatzhalter(gewaehlteVorlage.betreff, werte) : "";
  const inhaltVorausgefuellt = gewaehlteVorlage ? renderPlatzhalter(gewaehlteVorlage.inhalt, werte) : "";

  return (
    <main>
      <h1>Geburtstags-Mail an {name}</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        An {email}. Vorlage ist vorausgefüllt — vor dem Senden nach Bedarf anpassen.
      </p>

      <Link href="/geburtstage" className="au-btn au-btn-secondary au-btn-sm" style={{ marginBottom: "1rem", display: "inline-block" }}>
        ← Zurück zu Geburtstage
      </Link>

      {!vorlagen?.length && (
        <div className="au-card">
          <p style={{ margin: 0 }}>
            Noch keine Vorlage angelegt.{" "}
            <Link href="/geburtstage/vorlagen">Jetzt eine Vorlage anlegen</Link>, dann steht hier ein vorausgefüllter
            Text bereit.
          </p>
        </div>
      )}

      {!!vorlagen?.length && vorlagen.length > 1 && (
        <div className="au-card" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Vorlage:</span>
          {vorlagen.map((v) => (
            <Link
              key={v.id}
              href={`/geburtstage/senden?quelle=${quelle}&id=${id}&vorlage_id=${v.id}`}
              className={`au-btn au-btn-sm ${gewaehlteVorlage?.id === v.id ? "au-btn-primary" : "au-btn-secondary"}`}
            >
              {v.name}
            </Link>
          ))}
        </div>
      )}

      <div className="au-card" style={{ maxWidth: 640 }}>
        <form action={sendeGeburtstagsMail}>
          <input type="hidden" name="quelle" value={quelle} />
          <input type="hidden" name="kontakt_id" value={id} />
          <input type="hidden" name="email" value={email} />
          {gewaehlteVorlage && <input type="hidden" name="vorlage_id" value={gewaehlteVorlage.id} />}

          <label className="au-label">Betreff</label>
          <input className="au-input" name="betreff" required defaultValue={betreffVorausgefuellt} />

          <label className="au-label">Inhalt</label>
          <textarea className="au-textarea" name="inhalt" rows={10} required defaultValue={inhaltVorausgefuellt} />

          <div style={{ marginTop: "0.75rem" }}>
            <SendenButton />
          </div>
        </form>
      </div>
    </main>
  );
}
