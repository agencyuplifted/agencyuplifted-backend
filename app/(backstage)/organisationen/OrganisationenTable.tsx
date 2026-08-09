"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDatum } from "@/lib/format";

type Row = {
  id: string;
  name: string;
  ort: string | null;
  ust_id: string | null;
  erstellt_am: string;
  seminare: string[];
};

type SortKey = "name" | "ort" | "ust_id" | "seminare" | "erstellt_am";

export default function OrganisationenTable({ organisationen }: { organisationen: Row[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [seminarFilter, setSeminarFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("erstellt_am");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const alleSeminare = useMemo(() => {
    const set = new Set<string>();
    organisationen.forEach((o) => o.seminare.forEach((s) => set.add(s)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [organisationen]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const gefiltert = useMemo(() => {
    const liste = organisationen.filter((o) => {
      const matchSearch =
        !search ||
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        (o.ort || "").toLowerCase().includes(search.toLowerCase());
      const matchSeminar = !seminarFilter || o.seminare.includes(seminarFilter);
      return matchSearch && matchSeminar;
    });
    liste.sort((a, b) => {
      let av = "";
      let bv = "";
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "ort":
          av = a.ort || "";
          bv = b.ort || "";
          break;
        case "ust_id":
          av = a.ust_id || "";
          bv = b.ust_id || "";
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
  }, [organisationen, search, seminarFilter, sortKey, sortDir]);

  function pfeil(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div>
      <div className="au-toolbar">
        <input
          className="au-input"
          placeholder="Suche nach Name oder Ort..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="au-select" value={seminarFilter} onChange={(e) => setSeminarFilter(e.target.value)}>
          <option value="">Alle Seminare</option>
          {alleSeminare.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="au-toolbar-count">{gefiltert.length} von {organisationen.length}</span>
      </div>

      <table className="au-table">
        <thead>
          <tr>
            <th className="au-th-sortable" onClick={() => toggleSort("name")}>Name{pfeil("name")}</th>
            <th className="au-th-sortable" onClick={() => toggleSort("ort")}>Ort{pfeil("ort")}</th>
            <th className="au-th-sortable" onClick={() => toggleSort("ust_id")}>USt-ID{pfeil("ust_id")}</th>
            <th className="au-th-sortable" onClick={() => toggleSort("seminare")}>Seminare{pfeil("seminare")}</th>
            <th className="au-th-sortable" onClick={() => toggleSort("erstellt_am")}>Erfasst{pfeil("erstellt_am")}</th>
          </tr>
        </thead>
        <tbody>
          {gefiltert.map((o) => (
            <tr key={o.id} className="au-table-row-link" onClick={() => router.push(`/organisationen/${o.id}`)}>
              <td style={{ color: "#0B1B33", fontWeight: 600 }}>{o.name}</td>
              <td>{o.ort || "—"}</td>
              <td>{o.ust_id || "—"}</td>
              <td>{o.seminare.length ? o.seminare.join(", ") : "—"}</td>
              <td>{formatDatum(o.erstellt_am)}</td>
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
