"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDatum } from "@/lib/format";
import { speichereTeilnehmerSegment, loescheTeilnehmerSegment } from "@/lib/actions";

type Row = {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string | null;
  erstellt_am: string;
  anrede: string;
  rolle: string;
  unternehmer_status: string;
  seminare: string[];
  position: string | null;
  agentur: string | null;
  consent: string;
  deaktiviert: boolean;
  tags: string[];
};

type Segment = {
  id: string;
  name: string;
  filter_kriterien: { anrede?: string[]; rolle?: string[]; seminartypen?: string[]; unternehmer_status?: string[]; tags?: string[]; regeln?: unknown };
};

const ANREDE_LABEL: Record<string, string> = { Herr: "Männer", Frau: "Frauen", Divers: "Divers", keine_angabe: "Ohne Angabe" };
const UNTERNEHMER_LABEL: Record<string, string> = { unternehmer: "Unternehmer:in", mitarbeiter: "Mitarbeiter:in", unbekannt: "—" };
const ROLLE_LABEL: Record<string, string> = { mitarbeiter: "Mitarbeiter (Seminar)", gastreferent: "Gastreferent", organisator: "Organisator" };

function initialen(vorname: string, nachname: string) {
  return `${(vorname || "").trim().charAt(0)}${(nachname || "").trim().charAt(0)}`.toUpperCase() || "?";
}

type SortKey = "name" | "email" | "telefon" | "seminare" | "erstellt_am";

export default function TeilnehmerTable({
  teilnehmer,
  segmente,
  tags,
}: {
  teilnehmer: Row[];
  segmente: Segment[];
  tags: { id: string; label: string; aktiv: boolean }[];
}) {
  const [tagFilter, setTagFilter] = useState("");
  // Filtergruppen aus dem Kampagnen-Baukasten (Regeln mit und/oder) kann diese
  // einfache Filterleiste nicht abbilden -- die gibt es nur unter /kampagnen.
  const einfacheSegmente = segmente.filter((sg) => !sg.filter_kriterien?.regeln);
  const tagLabel = new Map(tags.map((t) => [t.id, t.label]));
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [seminarFilter, setSeminarFilter] = useState("");
  const [anredeFilter, setAnredeFilter] = useState("");
  const [rolleFilter, setRolleFilter] = useState("");
  const [unternehmerFilter, setUnternehmerFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("erstellt_am");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const alleSeminare = useMemo(() => {
    const set = new Set<string>();
    teilnehmer.forEach((t) => t.seminare.forEach((s) => set.add(s)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [teilnehmer]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function wendeSegmentAn(segmentId: string) {
    const segment = segmente.find((s) => s.id === segmentId);
    if (!segment) return;
    setAnredeFilter(segment.filter_kriterien.anrede?.[0] || "");
    setRolleFilter(segment.filter_kriterien.rolle?.[0] || "");
    setSeminarFilter(segment.filter_kriterien.seminartypen?.[0] || "");
    setUnternehmerFilter(segment.filter_kriterien.unternehmer_status?.[0] || "");
    setTagFilter(segment.filter_kriterien.tags?.[0] || "");
  }

  function kampagneStarten() {
    const params = new URLSearchParams();
    if (anredeFilter) params.set("anrede", anredeFilter);
    if (rolleFilter) params.set("rolle", rolleFilter);
    if (seminarFilter) params.set("seminartypen", seminarFilter);
    if (unternehmerFilter) params.set("unternehmer_status", unternehmerFilter);
    if (tagFilter) params.set("tags", tagFilter);
    router.push(`/kampagnen/neu?${params.toString()}`);
  }

  const gefiltert = useMemo(() => {
    const liste = teilnehmer.filter((t) => {
      const name = `${t.vorname} ${t.nachname}`.toLowerCase();
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        name.includes(q) ||
        (t.email || "").toLowerCase().includes(q) ||
        (t.telefon || "").toLowerCase().includes(q) ||
        (t.agentur || "").toLowerCase().includes(q);
      const matchSeminar = !seminarFilter || t.seminare.includes(seminarFilter);
      const matchAnrede = !anredeFilter || t.anrede === anredeFilter;
      const matchRolle = !rolleFilter || t.rolle === rolleFilter;
      const matchUnternehmer = !unternehmerFilter || t.unternehmer_status === unternehmerFilter;
      const matchTag = !tagFilter || t.tags.includes(tagFilter);
      return matchSearch && matchSeminar && matchAnrede && matchRolle && matchUnternehmer && matchTag;
    });
    liste.sort((a, b) => {
      let av = "";
      let bv = "";
      switch (sortKey) {
        case "name":
          av = `${a.vorname} ${a.nachname}`;
          bv = `${b.vorname} ${b.nachname}`;
          break;
        case "email":
          av = a.email || "";
          bv = b.email || "";
          break;
        case "telefon":
          av = a.telefon || "";
          bv = b.telefon || "";
          break;
        case "seminare":
          av = a.seminare.join(", ");
          bv = b.seminare.join(", ");
          break;
        case "erstellt_am":
          av = a.erstellt_am;
          bv = b.erstellt_am;
          break;
      }
      const cmp = av.localeCompare(bv, "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return liste;
  }, [teilnehmer, search, seminarFilter, anredeFilter, rolleFilter, unternehmerFilter, sortKey, sortDir]);

  function pfeil(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  const filterAktiv = !!(anredeFilter || rolleFilter || seminarFilter || unternehmerFilter || tagFilter);
  function filterZuruecksetzen() {
    setAnredeFilter("");
    setRolleFilter("");
    setSeminarFilter("");
    setUnternehmerFilter("");
    setTagFilter("");
    setSearch("");
  }

  const sortierKopf = (key: SortKey, label: string) => (
    <button type="button" className={`au-sortkopf${sortKey === key ? " aktiv" : ""}`} onClick={() => toggleSort(key)}>
      {label}{pfeil(key)}
    </button>
  );

  return (
    <div>
      <section className="au-panel au-panel-breit">
        <div className="au-filterleiste">
          <div className="au-suchfeld">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input placeholder="Name, E-Mail, Telefon oder Agentur …" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Teilnehmer suchen" />
          </div>
          <select className="au-select" value={seminarFilter} onChange={(e) => setSeminarFilter(e.target.value)} aria-label="Seminar">
            <option value="">Alle Seminare</option>
            {alleSeminare.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="au-select" value={unternehmerFilter} onChange={(e) => setUnternehmerFilter(e.target.value)} aria-label="Unternehmer:in oder Mitarbeiter:in">
            <option value="">Unternehmer & Mitarbeiter</option>
            <option value="unternehmer">Unternehmer:in</option>
            <option value="mitarbeiter">Mitarbeiter:in</option>
            <option value="unbekannt">Ohne Angabe</option>
          </select>
          <select className="au-select" value={rolleFilter} onChange={(e) => setRolleFilter(e.target.value)} aria-label="Rolle beim Seminar">
            <option value="">Alle Rollen</option>
            <option value="teilnehmer">Teilnehmer</option>
            <option value="mitarbeiter">Mitarbeiter</option>
            <option value="gastreferent">Gastreferent</option>
            <option value="organisator">Organisator</option>
          </select>
          <select className="au-select" value={anredeFilter} onChange={(e) => setAnredeFilter(e.target.value)} aria-label="Geschlecht">
            <option value="">Alle Geschlechter</option>
            <option value="Frau">Frauen</option>
            <option value="Herr">Männer</option>
            <option value="Divers">Divers</option>
            <option value="keine_angabe">Ohne Angabe</option>
          </select>
          {tags.length > 0 && (
            <select className="au-select" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Tag">
              <option value="">Alle Tags</option>
              {tags
                .filter((t) => t.aktiv || t.id === tagFilter)
                .map((t) => (
                  <option key={t.id} value={t.id}>#{t.label}</option>
                ))}
            </select>
          )}
          {einfacheSegmente.length > 0 && (
            <select className="au-select" value="" onChange={(e) => e.target.value && wendeSegmentAn(e.target.value)} aria-label="Gespeicherte Filtergruppe">
              <option value="">Filtergruppe laden …</option>
              {einfacheSegmente.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="au-filterleiste-fuss">
          <span className="au-klein"><strong>{gefiltert.length}</strong> von {teilnehmer.length}</span>
          {(filterAktiv || search) && <button type="button" className="au-link" onClick={filterZuruecksetzen}>Filter zurücksetzen</button>}
          {filterAktiv && (
            <span className="au-filterleiste-aktionen">
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={kampagneStarten}>
                Kampagne aus Auswahl
              </button>
              <form
                action={speichereTeilnehmerSegment}
                onSubmit={(e) => {
                  const name = window.prompt('Name für diese Filtergruppe (z.B. "Unternehmerinnen Preisfindung"):');
                  if (!name) {
                    e.preventDefault();
                    return;
                  }
                  (e.currentTarget.querySelector('input[name="segment_name"]') as HTMLInputElement).value = name;
                }}
                style={{ display: "inline" }}
              >
                <input type="hidden" name="segment_name" />
                {anredeFilter && <input type="hidden" name="anrede" value={anredeFilter} />}
                {rolleFilter && <input type="hidden" name="rolle" value={rolleFilter} />}
                {seminarFilter && <input type="hidden" name="seminartypen" value={seminarFilter} />}
                {unternehmerFilter && <input type="hidden" name="unternehmer_status" value={unternehmerFilter} />}
                {tagFilter && <input type="hidden" name="tags" value={tagFilter} />}
                <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Als Filtergruppe speichern</button>
              </form>
            </span>
          )}
        </div>

        <div className="au-plist-kopf" aria-hidden="true">
          {sortierKopf("name", "Person")}
          {sortierKopf("email", "Kontakt")}
          <span>Status</span>
          {sortierKopf("seminare", "Seminare")}
          {sortierKopf("erstellt_am", "Erfasst")}
        </div>
        <ul className="au-plist">
          {gefiltert.map((t) => (
            <li key={t.id} className={t.deaktiviert ? "deaktiviert" : undefined}>
              <a href={`/teilnehmer/${t.id}`} className="au-plist-zeile" onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); router.push(`/teilnehmer/${t.id}`); } }}>
                <span className="au-plist-person">
                  <span className="au-initialen">{initialen(t.vorname, t.nachname)}</span>
                  <span className="au-plist-name">
                    <strong>{t.vorname} {t.nachname}</strong>
                    <span className="au-klein">{[t.position, t.agentur].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                </span>
                <span className="au-plist-kontakt">
                  <span>{t.email || "—"}</span>
                  {t.telefon && <span className="au-klein">{t.telefon}</span>}
                </span>
                <span className="au-plist-status">
                  {t.deaktiviert && <span className="au-badge au-badge-neutral">deaktiviert</span>}
                  {t.unternehmer_status !== "unbekannt" && <span className="au-badge au-badge-neutral">{UNTERNEHMER_LABEL[t.unternehmer_status]}</span>}
                  {ROLLE_LABEL[t.rolle] && <span className="au-badge au-badge-gold">{ROLLE_LABEL[t.rolle]}</span>}
                  {t.consent === "abgemeldet" && <span className="au-badge au-badge-danger" title="Marketing-Mails abgemeldet">abgemeldet</span>}
                  {t.tags.slice(0, 2).map((id) => tagLabel.get(id) && <span key={id} className="au-badge au-badge-neutral au-badge-tag">#{tagLabel.get(id)}</span>)}
                  {t.tags.length > 2 && <span className="au-klein">+{t.tags.length - 2}</span>}
                </span>
                <span className="au-plist-seminare">
                  {t.seminare.slice(0, 2).map((s) => <span key={s} className="au-etikett">{s}</span>)}
                  {t.seminare.length > 2 && <span className="au-klein">+{t.seminare.length - 2}</span>}
                  {!t.seminare.length && <span className="au-klein">—</span>}
                </span>
                <span className="au-plist-datum au-klein">{formatDatum(t.erstellt_am)}</span>
              </a>
            </li>
          ))}
          {!gefiltert.length && <li className="au-leer" style={{ padding: "1rem 1.15rem" }}>Keine Treffer.</li>}
        </ul>
      </section>

      {segmente.length > 0 && (
        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer", color: "#0B1B33", fontWeight: 600 }}>Gespeicherte Filtergruppen verwalten ({segmente.length})</summary>
          <div className="au-card" style={{ marginTop: "0.75rem" }}>
            {segmente.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0", borderBottom: "1px solid var(--color-border)" }}>
                <span>{s.name}</span>
                <form action={loescheTeilnehmerSegment}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
