"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDatum } from "@/lib/format";

type Row = {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string | null;
  erstellt_am: string;
  seminare: string[];
};

type SortKey = "name" | "email" | "telefon" | "seminare" | "erstellt_am";

export default function TeilnehmerTable({ teilnehmer }: { teilnehmer: Row[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [seminarFilter, setSeminarFilter] = useState("");
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

  const gefiltert = useMemo(() => {
    const liste = teilnehmer.filter((t) => {
      const name = `${t.vorname} ${t.nachname}`.toLowerCase();
      const matchSearch =
        !search ||
        name.includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase()) ||
        (t.telefon || "").toLowerCase().includes(search.toLowerCase());
      const matchSeminar = !seminarFilter || t.seminare.includes(seminarFilter);
      return matchSearch && matchSeminar;
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
  }, [teilnehmer, search, seminarFilter, sortKey, sortDir]);

  function pfeil(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div>
      <div className="au-toolbar">
        <input
          className="au-input"
          placeholder="Suche nach Name, E-Mail oder Telefon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="au-select" value={seminarFilter} onChange={(e) => setSeminarFilter(e.target.value)}>
          <option value="">Alle Seminare</option>
          {alleSeminare.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="au-toolbar-count">{gefiltert.length} von {teilnehmer.length}</span>
      </div>

      <table className="au-table">
        <thead>
          <tr>
            <th className="au-th-sortable" onClick={() => toggleSort("name")}>Name{pfeil("name")}</th>
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
              <td>{t.email}</td>
              <td>{t.telefon || "—"}</td>
              <td>{t.seminare.length ? t.seminare.join(", ") : "—"}</td>
              <td>{formatDatum(t.erstellt_am)}</td>
            </tr>
          ))}
          {!gefiltert.length && (
            <tr className="au-table-empty"><td colSpan={5}>Keine Treffer.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
