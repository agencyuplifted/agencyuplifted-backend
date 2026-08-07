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
  seminare: string[];
};

type Segment = {
  id: string;
  name: string;
  filter_kriterien: { anrede?: string[]; rolle?: string[]; seminartypen?: string[] };
};

const ANREDE_LABEL: Record<string, string> = { Herr: "Männer", Frau: "Frauen", Divers: "Divers", keine_angabe: "Ohne Angabe" };

type SortKey = "name" | "email" | "telefon" | "seminare" | "erstellt_am";

export default function TeilnehmerTable({ teilnehmer, segmente }: { teilnehmer: Row[]; segmente: Segment[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [seminarFilter, setSeminarFilter] = useState("");
  const [anredeFilter, setAnredeFilter] = useState("");
  const [rolleFilter, setRolleFilter] = useState("");
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
  }

  function kampagneStarten() {
    const params = new URLSearchParams();
    if (anredeFilter) params.set("anrede", anredeFilter);
    if (rolleFilter) params.set("rolle", rolleFilter);
    if (seminarFilter) params.set("seminartypen", seminarFilter);
    router.push(`/kampagnen/neu?${params.toString()}`);
  }

  const gefiltert = useMemo(() => {
    const liste = teilnehmer.filter((t) => {
      const name = `${t.vorname} ${t.nachname}`.toLowerCase();
      const matchSearch =
        !search ||
        name.includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase()) ||
        (t.telefon || "").toLowerCase().includes(search.toLowerCase());
      const matchSeminar = !seminarFilter || t.seminare.includes(seminarFilter);
      const matchAnrede = !anredeFilter || t.anrede === anredeFilter;
      const matchRolle = !rolleFilter || t.rolle === rolleFilter;
      return matchSearch && matchSeminar && matchAnrede && matchRolle;
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
          av = a.email;
          bv = b.email;
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
  }, [teilnehmer, search, seminarFilter, anredeFilter, rolleFilter, sortKey, sortDir]);

  function pfeil(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  const filterAktiv = !!(anredeFilter || rolleFilter || seminarFilter);

  return (
    <div>
      <div className="au-toolbar" style={{ flexWrap: "wrap" }}>
        <input
          className="au-input"
          placeholder="Suche nach Name, E-Mail oder Telefon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="au-select" value={anredeFilter} onChange={(e) => setAnredeFilter(e.target.value)}>
          <option value="">Alle Geschlechter</option>
          <option value="Frau">Frauen</option>
          <option value="Herr">Männer</option>
          <option value="Divers">Divers</option>
          <option value="keine_angabe">Ohne Angabe</option>
        </select>
        <select className="au-select" value={rolleFilter} onChange={(e) => setRolleFilter(e.target.value)}>
          <option value="">Alle Rollen</option>
          <option value="teilnehmer">Teilnehmer</option>
          <option value="mitarbeiter">Mitarbeiter</option>
          <option value="gastreferent">Gastreferent</option>
          <option value="organisator">Organisator</option>
        </select>
        <select className="au-select" value={seminarFilter} onChange={(e) => setSeminarFilter(e.target.value)}>
          <option value="">Alle Seminare</option>
          {alleSeminare.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {segmente.length > 0 && (
          <select className="au-select" defaultValue="" onChange={(e) => e.target.value && wendeSegmentAn(e.target.value)}>
            <option value="">Gespeicherte Filtergruppe...</option>
            {segmente.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <span className="au-toolbar-count">{gefiltert.length} von {teilnehmer.length}</span>
      </div>

      {filterAktiv && (
        <div className="au-card au-card-tint" style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
          <span>{gefiltert.length} Treffer mit aktivem Filter.</span>
          <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={kampagneStarten}>
            Kampagne aus dieser Auswahl starten
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
            <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Als Filtergruppe speichern</button>
          </form>
        </div>
      )}

      <table className="au-table">
        <thead>
          <tr>
            <th className="au-th-sortable" onClick={() => toggleSort("name")}>Name{pfeil("name")}</th>
            <th>Geschlecht</th>
            <th className="au-th-sortable" onClick={() => toggleSort("email")}>E-Mail{pfeil("email")}</th>
            <th className="au-th-sortable" onClick={() => toggleSort("telefon")}>Telefon{pfeil("telefon")}</th>
            <th className="au-th-sortable" onClick={() => toggleSort("seminare")}>Seminare{pfeil("seminare")}</th>
            <th className="au-th-sortable" onClick={() => toggleSort("erstellt_am")}>Erfasst{pfeil("erstellt_am")}</th>
          </tr>
        </thead>
        <tbody>
          {gefiltert.map((t) => (
            <tr key={t.id} className="au-table-row-link" onClick={() => router.push(`/teilnehmer/${t.id}`)}>
              <td style={{ color: "#102A4C", fontWeight: 600 }}>{t.vorname} {t.nachname}</td>
              <td>{ANREDE_LABEL[t.anrede] || t.anrede}</td>
              <td>{t.email}</td>
              <td>{t.telefon || "—"}</td>
              <td>{t.seminare.length ? t.seminare.join(", ") : "—"}</td>
              <td>{formatDatum(t.erstellt_am)}</td>
            </tr>
          ))}
          {!gefiltert.length && (
            <tr className="au-table-empty"><td colSpan={6}>Keine Treffer.</td></tr>
          )}
        </tbody>
      </table>

      {segmente.length > 0 && (
        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer", color: "#102A4C", fontWeight: 600 }}>Gespeicherte Filtergruppen verwalten ({segmente.length})</summary>
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
