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

  const th: React.CSSProperties = { padding: "0.5rem", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          placeholder="Suche nach Name, E-Mail oder Telefon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "0.5rem", minWidth: 260, border: "1px solid #ccc" }}
        />
        <select value={seminarFilter} onChange={(e) => setSeminarFilter(e.target.value)} style={{ padding: "0.5rem", border: "1px solid #ccc" }}>
          <option value="">Alle Seminare</option>
          {alleSeminare.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span style={{ padding: "0.5rem", color: "#666", fontSize: "0.85rem" }}>{gefiltert.length} von {teilnehmer.length}</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={th} onClick={() => toggleSort("name")}>Name{pfeil("name")}</th>
            <th style={th} onClick={() => toggleSort("email")}>E-Mail{pfeil("email")}</th>
            <th style={th} onClick={() => toggleSort("telefon")}>Telefon{pfeil("telefon")}</th>
            <th style={th} onClick={() => toggleSort("seminare")}>Seminare{pfeil("seminare")}</th>
            <th style={th} onClick={() => toggleSort("erstellt_am")}>Erfasst{pfeil("erstellt_am")}</th>
          </tr>
        </thead>
        <tbody>
          {gefiltert.map((t) => (
            <tr
              key={t.id}
              onClick={() => router.push(`/teilnehmer/${t.id}`)}
              style={{ borderBottom: "1px solid #e2e2e2", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f7f9fc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ padding: "0.5rem", color: "#102A4C", fontWeight: 600 }}>{t.vorname} {t.nachname}</td>
              <td style={{ padding: "0.5rem" }}>{t.email}</td>
              <td style={{ padding: "0.5rem" }}>{t.telefon || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{t.seminare.length ? t.seminare.join(", ") : "—"}</td>
              <td style={{ padding: "0.5rem" }}>{formatDatum(t.erstellt_am)}</td>
            </tr>
          ))}
          {!gefiltert.length && (
            <tr><td colSpan={5} style={{ padding: "0.5rem", color: "#888" }}>Keine Treffer.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
