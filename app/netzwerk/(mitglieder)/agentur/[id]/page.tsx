import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMitglied } from "@/lib/netzwerk";
import { initialen, AGENTUR_ROLLE_LABEL } from "../../../hilfen";

export const metadata = { title: "Agentur" };

const ROLLEN_REIHENFOLGE = ["inhaber", "mitinhaber", "angestellt", "unbekannt"];

export default async function AgenturPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireMitglied();
  const { data: o } = await client
    .from("organisationen")
    .select("id, name, branche, rechnungsadresse_ort, rechnungsadresse_land, teilnehmer_organisationen(agentur_rolle, teilnehmer(id, vorname, nachname, position, netzwerk_gastgeber))")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  // Nur Mitglieder, die fuer mich sichtbar sind (RLS liefert sonst teilnehmer = null)
  const personen = ((o as any).teilnehmer_organisationen || [])
    .filter((z: any) => z.teilnehmer)
    .sort((x: any, y: any) => ROLLEN_REIHENFOLGE.indexOf(x.agentur_rolle) - ROLLEN_REIHENFOLGE.indexOf(y.agentur_rolle));

  return (
    <main>
      <p className="ua-klein" style={{ margin: "0 0 0.75rem" }}><Link href="/netzwerk?ansicht=agenturen">← Agenturen</Link></p>
      <div className="ua-karte">
        <h1 style={{ margin: 0 }}>{o.name}</h1>
        <div className="ua-klein">{[o.branche, o.rechnungsadresse_ort, o.rechnungsadresse_land].filter(Boolean).join(" · ")}</div>
      </div>
      <h2>Personen im Netzwerk</h2>
      <div className="ua-raster">
        {personen.map((z: any) => (
          <Link key={z.teilnehmer.id} href={`/netzwerk/person/${z.teilnehmer.id}`} className="ua-karte ua-person">
            <div className="ua-zeile">
              <span className="ua-avatar">{initialen(z.teilnehmer.vorname, z.teilnehmer.nachname)}</span>
              <div>
                <strong>{z.teilnehmer.vorname} {z.teilnehmer.nachname}</strong>
                <div className="ua-klein">{[z.teilnehmer.netzwerk_gastgeber ? "Gastgeber" : AGENTUR_ROLLE_LABEL[z.agentur_rolle], z.teilnehmer.position].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
