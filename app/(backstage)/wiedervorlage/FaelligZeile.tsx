import Link from "next/link";
import { setzeAufgabeErledigt } from "@/lib/actions";
import { formatTag } from "@/lib/events";
import { FAELLIG_ART_LABEL, type FaelligerPunkt } from "@/lib/wiedervorlage";
import AktionsFormular from "../AktionsFormular";

// Eine Zeile "faellig" (Aufgabe, Inbox-Wiedervorlage, CfP, Event) -- fuer
// /wiedervorlage und das Dashboard-Widget. Aufgaben lassen sich direkt abhaken.
export default function FaelligZeile({ p, heute }: { p: FaelligerPunkt; heute: string }) {
  return (
    <div className="au-event-zeile">
      <span style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        {p.art === "aufgabe" && (
          <AktionsFormular action={setzeAufgabeErledigt}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="erledigt" value="true" />
            <button type="submit" className="au-haken" title="als erledigt markieren" aria-label="erledigt" />
          </AktionsFormular>
        )}
        <span>
          <span className={`au-badge ${p.art === "cfp" ? "au-badge-gold" : p.art === "aufgabe" ? "au-badge-neutral" : p.art === "event" ? "au-badge-success" : "au-badge-warning"}`}>
            {FAELLIG_ART_LABEL[p.art]}
          </span>{" "}
          <Link href={p.href}>{p.titel.length > 110 ? p.titel.slice(0, 110) + " …" : p.titel}</Link>
          {p.kontext && <span className="au-klein"> · {p.kontext.length > 60 ? p.kontext.slice(0, 60) + " …" : p.kontext}</span>}
        </span>
      </span>
      <span className={`au-klein ${p.ueberfaellig ? "au-text-danger" : p.datum === heute ? "au-text-warning" : ""}`} style={{ whiteSpace: "nowrap" }}>
        {p.datum === heute ? "heute" : formatTag(p.datum)}
      </span>
    </div>
  );
}
