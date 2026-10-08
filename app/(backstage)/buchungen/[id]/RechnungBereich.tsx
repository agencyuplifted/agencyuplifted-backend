import Link from "next/link";
import AktionsFormular from "../../AktionsFormular";
import {
  erneuereRechnungsentwurfAktion,
  erstelleRechnungsentwurfAktion,
  gibRechnungFreiAktion,
  sendeRechnungErneutAktion,
  verwirfRechnungsentwurfAktion,
  pruefeRechnungszahlungAktion,
} from "@/lib/actions";
import { rechnungsVorschau, fastbillDetailsLink } from "@/lib/rechnungen";
import { formatDatum, formatEUR } from "@/lib/format";

// Bereich "Rechnung" auf der Buchungsseite: Vorschau -> Entwurf in FastBill ->
// Freigeben & Senden (Resend) -> Zahlungsstand (lib/rechnungen.ts).
const STATUS: Record<string, { text: string; klasse: string }> = {
  entwurf: { text: "Entwurf in FastBill", klasse: "au-badge-warning" },
  wird_freigegeben: { text: "wird freigegeben …", klasse: "au-badge-warning" },
  freigegeben: { text: "freigegeben, nicht verschickt", klasse: "au-badge-danger" },
  versendet: { text: "verschickt", klasse: "au-badge-success" },
  geloescht: { text: "Entwurf verworfen", klasse: "au-badge-neutral" },
  storniert: { text: "storniert", klasse: "au-badge-neutral" },
};
const ZAHLUNG: Record<string, { text: string; klasse: string }> = {
  offen: { text: "offen", klasse: "au-badge-neutral" },
  teilbezahlt: { text: "teilbezahlt", klasse: "au-badge-warning" },
  bezahlt: { text: "bezahlt", klasse: "au-badge-success" },
};

// **fett** aus den Rechnungsvorlagen auch in der Backstage-Vorschau fett zeigen
function MitFett({ text }: { text: string }) {
  const teile = text.split(/(\*\*.+?\*\*)/g);
  return <>{teile.map((t, i) => (t.startsWith("**") && t.endsWith("**") && t.length > 4 ? <b key={i}>{t.slice(2, -2)}</b> : <span key={i}>{t}</span>))}</>;
}

export default async function RechnungBereich({ supabase, buchungId }: { supabase: any; buchungId: string }) {
  const { data: rechnungen } = await supabase.from("buchung_rechnungen").select("*").eq("buchung_id", buchungId).order("erstellt_am", { ascending: false });
  const aktiv = (rechnungen || []).find((r: any) => ["entwurf", "wird_freigegeben", "freigegeben", "versendet"].includes(r.status));
  const frueher = (rechnungen || []).filter((r: any) => r !== aktiv);
  const vorschau = aktiv ? null : await rechnungsVorschau(supabase, buchungId);
  const detailsLink = aktiv?.status === "entwurf" && aktiv.fastbill_invoice_id ? await fastbillDetailsLink(aktiv.fastbill_invoice_id) : null;
  if (vorschau?.keineRechnung && !frueher.length) return null;

  const empfaenger = aktiv?.empfaenger || vorschau?.empfaenger;
  const positionen: any[] = aktiv?.positionen || vorschau?.positionen || [];
  const netto = aktiv ? Number(aktiv.betrag_netto || 0) : vorschau?.netto || 0;
  const brutto = aktiv ? Number(aktiv.betrag_brutto || 0) : vorschau?.brutto || 0;

  return (
    <div className="au-card au-rechnung">
      <div className="au-rechnung-kopf">
        <h2 style={{ margin: 0 }}>Rechnung</h2>
        {aktiv && (
          <span style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <span className={`au-badge ${STATUS[aktiv.status]?.klasse}`}>{STATUS[aktiv.status]?.text}</span>
            {["freigegeben", "versendet"].includes(aktiv.status) && (
              <span className={`au-badge ${ZAHLUNG[aktiv.zahlungsstatus]?.klasse}`}>Zahlung: {ZAHLUNG[aktiv.zahlungsstatus]?.text}</span>
            )}
          </span>
        )}
      </div>

      {vorschau?.keineRechnung && <p className="au-klein">{vorschau.keineRechnung}</p>}

      {!vorschau?.keineRechnung && empfaenger && (
        <>
          <div className="au-rechnung-raster">
            <div>
              <div className="au-klein">Empfänger</div>
              <div className="au-rechnung-empfaenger">
                {empfaenger.firma && <b>{empfaenger.firma}</b>}
                <span>{[empfaenger.vorname, empfaenger.nachname].filter(Boolean).join(" ")}</span>
                <span>{empfaenger.strasse || <em className="au-text-danger">Straße fehlt</em>}</span>
                <span>{empfaenger.plz && empfaenger.ort ? `${empfaenger.plz} ${empfaenger.ort}` : <em className="au-text-danger">PLZ/Ort fehlt</em>}{empfaenger.land && empfaenger.land !== "DE" ? ` · ${empfaenger.land}` : ""}</span>
                <span className="au-klein">{empfaenger.email || "keine E-Mail"}{empfaenger.ust_id ? ` · USt-ID ${empfaenger.ust_id}` : ""}</span>
              </div>
            </div>
            {aktiv?.rechnungsnummer && (
              <div>
                <div className="au-klein">Rechnungsnummer</div>
                <b>{aktiv.rechnungsnummer}</b>
                {aktiv.dokument_url && (
                  <div><a href={aktiv.dokument_url} target="_blank" rel="noreferrer" className="au-klein">PDF öffnen ↗</a></div>
                )}
                {aktiv.versendet_am && <div className="au-klein">verschickt am {formatDatum(aktiv.versendet_am)} an {aktiv.empfaenger_email}</div>}
                {aktiv.bezahlt_am && <div className="au-klein">bezahlt am {formatDatum(aktiv.bezahlt_am)}</div>}
                {aktiv.zahlungsstatus === "teilbezahlt" && aktiv.bezahlt_betrag && <div className="au-klein">bisher {formatEUR(Number(aktiv.bezahlt_betrag))} eingegangen</div>}
              </div>
            )}
          </div>

          <table className="au-table au-rechnung-positionen">
            <thead>
              <tr><th>Position</th><th style={{ textAlign: "right" }}>Menge</th><th style={{ textAlign: "right" }}>Einzelpreis netto</th></tr>
            </thead>
            <tbody>
              {positionen.map((p: any, i: number) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "pre-line" }}><MitFett text={p.beschreibung} /></td>
                  <td style={{ textAlign: "right" }}>{p.menge}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatEUR(p.einzelpreis)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2} style={{ textAlign: "right" }}>Summe netto</td><td style={{ textAlign: "right" }}>{formatEUR(netto)}</td></tr>
              <tr><td colSpan={2} style={{ textAlign: "right" }}><b>Gesamt brutto</b></td><td style={{ textAlign: "right" }}><b>{formatEUR(brutto)}</b></td></tr>
            </tfoot>
          </table>
          {(aktiv?.einleitung || vorschau?.einleitung) && (
            <p className="au-klein" style={{ whiteSpace: "pre-line" }}>
              <b>Einleitung:</b> <MitFett text={aktiv?.einleitung || vorschau?.einleitung || ""} />
            </p>
          )}
        </>
      )}

      {aktiv?.fehler && <div className="au-banner au-banner-error">{aktiv.fehler}</div>}
      {aktiv?.hinweis && <div className="au-banner au-banner-warning">{aktiv.hinweis}</div>}

      {/* Aktionen je Zustand */}
      {!aktiv && vorschau && !vorschau.keineRechnung && (
        <>
          {vorschau.fehlt.length > 0 && (
            <div className="au-banner au-banner-warning">
              Für die Rechnung fehlt noch: {vorschau.fehlt.join(", ")}.{" "}
              {vorschau.empfaenger.organisation_id ? (
                <Link href={`/organisationen/${vorschau.empfaenger.organisation_id}`}>Organisation bearbeiten →</Link>
              ) : vorschau.empfaenger.teilnehmer_id ? (
                <Link href={`/teilnehmer/${vorschau.empfaenger.teilnehmer_id}#stammdaten`}>Teilnehmer bearbeiten →</Link>
              ) : null}
            </div>
          )}
          <p className="au-klein">
            FastBill-Vorlage: {vorschau.templateId || "FastBill-Standard"} · Texte: <Link href="/seminartypen#rechnungstexte">Seminarkategorien → Rechnungstexte</Link>
          </p>
          <AktionsFormular action={erstelleRechnungsentwurfAktion}>
            <input type="hidden" name="buchung_id" value={buchungId} />
            <button type="submit" className="au-btn au-btn-primary" disabled={vorschau.fehlt.length > 0}>Rechnungsentwurf in FastBill erstellen</button>
          </AktionsFormular>
          <p className="au-klein" style={{ marginBottom: 0 }}>Der Entwurf hat noch keine Rechnungsnummer und lässt sich in FastBill prüfen und anpassen; verschickt wird erst mit „Freigeben &amp; Senden“.</p>
        </>
      )}

      {aktiv?.status === "entwurf" && aktiv.fastbill_invoice_id && (
        <p className="au-klein">
          FastBill erzeugt das PDF erst bei der Freigabe.{" "}
          {detailsLink ? (
            <a href={detailsLink} target="_blank" rel="noreferrer">Entwurf in FastBill öffnen ↗</a>
          ) : (
            <>Den Entwurf findest Du in FastBill unter Ausgangsrechnungen → Entwürfe.</>
          )}
        </p>
      )}

      {aktiv?.fastbill_invoice_id && ["freigegeben", "versendet"].includes(aktiv.status) && (
        <details className="au-rechnung-pdf">
          <summary>Rechnung als PDF ansehen</summary>
          <iframe src={`/api/rechnungen/${aktiv.id}/pdf`} title="Rechnung als PDF" />
        </details>
      )}

      {aktiv?.status === "entwurf" && (
        <div className="au-rechnung-aktionen">
          <AktionsFormular
            action={gibRechnungFreiAktion}
            bestaetigung={`Rechnung jetzt fertigstellen und an ${aktiv.empfaenger_email || "den Rechnungsempfänger"} schicken? FastBill vergibt dabei die Rechnungsnummer – rückgängig nur per Storno. Änderungen, die Du im FastBill-Entwurf gemacht hast, werden übernommen.`}
          >
            <input type="hidden" name="buchung_id" value={buchungId} />
            <input type="hidden" name="rechnung_id" value={aktiv.id} />
            <button type="submit" className="au-btn au-btn-primary">Freigeben &amp; Senden</button>
          </AktionsFormular>
          <AktionsFormular action={erneuereRechnungsentwurfAktion}>
            <input type="hidden" name="buchung_id" value={buchungId} />
            <input type="hidden" name="rechnung_id" value={aktiv.id} />
            <button type="submit" className="au-btn au-btn-secondary" title="Nach Änderungen an den Rechnungstexten: Entwurf in FastBill löschen und mit den aktuellen Vorlagen neu anlegen">Entwurf neu aufbauen</button>
          </AktionsFormular>
          <AktionsFormular action={verwirfRechnungsentwurfAktion} bestaetigung="Entwurf in FastBill löschen? Es wird keine Rechnungsnummer verbraucht.">
            <input type="hidden" name="buchung_id" value={buchungId} />
            <input type="hidden" name="rechnung_id" value={aktiv.id} />
            <button type="submit" className="au-btn au-btn-secondary">Entwurf verwerfen</button>
          </AktionsFormular>
        </div>
      )}

      {aktiv?.status === "freigegeben" && (
        <AktionsFormular action={sendeRechnungErneutAktion}>
          <input type="hidden" name="buchung_id" value={buchungId} />
          <input type="hidden" name="rechnung_id" value={aktiv.id} />
          <button type="submit" className="au-btn au-btn-primary">Erneut senden</button>
        </AktionsFormular>
      )}

      {aktiv && ["freigegeben", "versendet"].includes(aktiv.status) && aktiv.zahlungsstatus !== "bezahlt" && (
        <AktionsFormular action={pruefeRechnungszahlungAktion} style={{ marginTop: "0.5rem" }}>
          <input type="hidden" name="buchung_id" value={buchungId} />
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Zahlung in FastBill jetzt prüfen</button>
          <span className="au-klein" style={{ marginLeft: "0.5rem" }}>
            {aktiv.zahlung_geprueft_am ? `zuletzt geprüft ${formatDatum(aktiv.zahlung_geprueft_am)}` : "wird täglich morgens automatisch geprüft"}
          </span>
        </AktionsFormular>
      )}

      {frueher.length > 0 && (
        <details className="au-klein" style={{ marginTop: "0.75rem" }}>
          <summary>Frühere Rechnungen ({frueher.length})</summary>
          <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
            {frueher.map((r: any) => (
              <li key={r.id}>
                {r.rechnungsnummer || "Entwurf"} · {STATUS[r.status]?.text} · {formatEUR(Number(r.betrag_netto || 0))} netto · {formatDatum(r.erstellt_am)}
                {r.hinweis ? ` · ${r.hinweis}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
