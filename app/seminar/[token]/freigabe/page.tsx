import { ladeSeminarKontext } from "@/lib/seminar-seite";
import { setzeTeilnehmerlisteFreigabe } from "@/lib/seminar-actions";
import NetzwerkFormular from "../../../netzwerk/NetzwerkFormular";
import SeminarKopf from "../SeminarKopf";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mein Eintrag" };

export default async function FreigabeSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { termin, teilnehmer } = await ladeSeminarKontext(token);
  return (
    <main>
      <SeminarKopf termin={termin} token={token} aktiv="freigabe" />
      <div className="ua-karte">
        <h2 style={{ marginTop: 0 }}>Dein Eintrag in der Teilnehmerliste</h2>
        <p className="ua-klein" style={{ marginTop: 0 }}>
          Nach dem Seminar bekommen alle Teilnehmer eine Übersicht, wer dabei war. Dein Name steht dort immer
          {teilnehmer.teilnehmerliste_opt_out ? " – außer du hast uns gebeten, dich nicht aufzuführen (das ist bei dir so hinterlegt)" : ""}.
          Mit deiner Freigabe zeigen wir zusätzlich dein Foto (falls wir eins haben) und dein LinkedIn-Profil, damit ihr euch leichter vernetzen könnt.
        </p>
        <NetzwerkFormular action={setzeTeilnehmerlisteFreigabe}>
          <input type="hidden" name="token" value={token} />
          <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", margin: "0.5rem 0 1rem" }}>
            <input type="checkbox" name="freigabe" defaultChecked={!!teilnehmer.teilnehmerliste_freigabe} style={{ marginTop: "0.25rem" }} />
            <span>Ja, zeigt mich in der Teilnehmerliste mit Foto und LinkedIn-Profil. Ich kann das hier jederzeit wieder abschalten.</span>
          </label>
          <label className="au-label" htmlFor="linkedin">Dein LinkedIn-Profil (optional)</label>
          <input className="au-input" id="linkedin" name="linkedin_url" type="url" defaultValue={teilnehmer.linkedin_url || ""} placeholder="https://www.linkedin.com/in/…" />
          <button type="submit" className="au-btn au-btn-primary">Speichern</button>
        </NetzwerkFormular>
      </div>
    </main>
  );
}
