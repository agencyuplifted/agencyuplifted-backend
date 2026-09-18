import { redirect } from "next/navigation";
import { createNetzwerkClient, ermittleZuordnung } from "@/lib/netzwerk";
import { bestaetigeIdentitaet, lehneIdentitaetAb, abmelden } from "@/lib/netzwerk-actions";
import NetzwerkFormular from "../NetzwerkFormular";

export const dynamic = "force-dynamic";
export const metadata = { title: "Willkommen" };

// Nach dem ersten Login: eindeutige Zuordnung zu genau einem Teilnehmer-Profil,
// bestaetigt von der Person selbst. Unklare Faelle legen NICHTS an, sondern
// landen in der Pruefliste fuer Markus.
export default async function WillkommenPage() {
  const client = await createNetzwerkClient();
  const { data } = await client.auth.getUser();
  if (!data.user?.email) redirect("/netzwerk/login");
  const zuordnung = await ermittleZuordnung(data.user.id, data.user.email);
  if (zuordnung.fall === "aktiv") redirect("/netzwerk");

  const abmeldenKnopf = (
    <form action={abmelden} style={{ marginTop: "1rem" }}>
      <button type="submit" className="ua-link">Abmelden</button>
    </form>
  );

  if (zuordnung.fall === "bestaetigen") {
    const t = zuordnung.teilnehmer;
    return (
      <div className="ua-karte ua-schmal" style={{ textAlign: "center" }}>
        <h1>Schön, dass du da bist!</h1>
        <p>Bist du</p>
        <p style={{ fontSize: "1.2rem", color: "var(--color-text)", fontWeight: 700, margin: "0.25rem 0" }}>
          {t.vorname} {t.nachname}
        </p>
        {t.agenturen.length > 0 && <p style={{ marginTop: 0 }}>{t.agenturen.join(", ")}</p>}
        <NetzwerkFormular action={bestaetigeIdentitaet}>
          <button type="submit" className="au-btn au-btn-primary" style={{ width: "100%" }}>Ja, das bin ich</button>
        </NetzwerkFormular>
        <NetzwerkFormular action={lehneIdentitaetAb} style={{ marginTop: "0.5rem" }}>
          <button type="submit" className="au-btn au-btn-secondary" style={{ width: "100%" }}>Nein, anderes Profil</button>
        </NetzwerkFormular>
      </div>
    );
  }

  return (
    <div className="ua-karte ua-schmal">
      <h1>{zuordnung.fall === "abgelehnt" ? "Kein Zugang" : "Einen Moment noch"}</h1>
      <p>
        {zuordnung.fall === "abgelehnt"
          ? "Für dieses Profil ist der Zugang zum Netzwerk derzeit nicht freigeschaltet. Bei Fragen melde dich gern direkt bei Markus."
          : "Wir konnten dein Profil nicht eindeutig zuordnen. Markus schaut sich das persönlich an und meldet sich bei dir – du musst nichts weiter tun."}
      </p>
      {abmeldenKnopf}
    </div>
  );
}
