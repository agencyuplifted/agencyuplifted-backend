import { NextRequest } from "next/server";
import { requireMitglied } from "@/lib/netzwerk";

function v(s: string | null | undefined): string {
  return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireMitglied();
  const { data: p } = await client
    .from("teilnehmer")
    .select("vorname, nachname, position, email, telefon, mobiltelefon, linkedin_url, teilnehmer_organisationen(ist_hauptorganisation, organisationen(name))")
    .eq("id", id)
    .maybeSingle();
  if (!p) return new Response("Nicht gefunden", { status: 404 });
  const orgs = (p.teilnehmer_organisationen || []) as any[];
  const org = (orgs.find((z) => z.ist_hauptorganisation) || orgs[0])?.organisationen?.name;
  const zeilen = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${v(p.nachname)};${v(p.vorname)};;;`,
    `FN:${v(`${p.vorname} ${p.nachname}`)}`,
    org ? `ORG:${v(org)}` : null,
    p.position ? `TITLE:${v(p.position)}` : null,
    p.email ? `EMAIL;TYPE=INTERNET,WORK:${v(p.email)}` : null,
    p.mobiltelefon ? `TEL;TYPE=CELL:${v(p.mobiltelefon)}` : null,
    p.telefon ? `TEL;TYPE=WORK:${v(p.telefon)}` : null,
    p.linkedin_url ? `URL:${v(p.linkedin_url)}` : null,
    "NOTE:Uplifted Agencies",
    "END:VCARD",
  ].filter(Boolean);
  const datei = `${p.vorname}-${p.nachname}`.replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, "_");
  return new Response(zeilen.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(datei)}.vcf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
