import Link from "next/link";
import { formatDatum } from "@/lib/format";

export default function SeminarKopf({ termin, token, aktiv }: { termin: any; token: string; aktiv: "unterlagen" | "teilnehmer" | "freigabe" }) {
  const titel = termin.titel || termin.seminartypen?.name || "Seminar";
  const zeitraum =
    termin.datum_ende && termin.datum_ende !== termin.datum_start
      ? `${formatDatum(termin.datum_start)} – ${formatDatum(termin.datum_ende)}`
      : formatDatum(termin.datum_start);
  return (
    <>
      <p className="ua-klein" style={{ margin: "0 0 0.2rem" }}>{zeitraum}{termin.veranstaltungsorte?.ort ? ` · ${termin.veranstaltungsorte.ort}` : ""}</p>
      <h1 style={{ marginTop: 0 }}>{titel}</h1>
      <nav className="ua-nav">
        <Link href={`/seminar/${token}/unterlagen`} style={aktiv === "unterlagen" ? { textDecoration: "underline" } : undefined}>Unterlagen</Link>
        <Link href={`/seminar/${token}/teilnehmer`} style={aktiv === "teilnehmer" ? { textDecoration: "underline" } : undefined}>Wer war dabei</Link>
        <Link href={`/seminar/${token}/freigabe`} style={aktiv === "freigabe" ? { textDecoration: "underline" } : undefined}>Mein Eintrag</Link>
      </nav>
    </>
  );
}
