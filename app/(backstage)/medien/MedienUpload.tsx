"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPresigned } from "@vercel/blob/client";
import { MEDIEN_TYPEN, MEDIEN_MAX_BYTES, medienOrdner, sichererDateiname, formatGroesse } from "@/lib/medien";

type Eintrag = { id: string; name: string; groesse: number; prozent: number; status: "laeuft" | "fertig" | "fehler"; meldung?: string; url?: string };

// Upload per Drag & Drop oder Dateiauswahl, mehrere Dateien nacheinander,
// Fortschritt pro Datei. Grosse Videos gehen als Multipart-Upload (stabiler
// bei langsamer Leitung).
export default function MedienUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [ueber, setUeber] = useState(false);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);

  const aendere = (id: string, teil: Partial<Eintrag>) => setEintraege((liste) => liste.map((e) => (e.id === id ? { ...e, ...teil } : e)));

  async function hochladen(dateien: FileList | File[]) {
    const neue = Array.from(dateien).map((datei) => ({ datei, id: `${datei.name}-${datei.size}-${Math.random().toString(36).slice(2)}` }));
    setEintraege((liste) => [...neue.map(({ datei, id }) => ({ id, name: datei.name, groesse: datei.size, prozent: 0, status: "laeuft" as const })), ...liste]);
    let einerOk = false;
    for (const { datei, id } of neue) {
      const ordner = medienOrdner(datei.type);
      if (!ordner) {
        aendere(id, { status: "fehler", meldung: "Nur MP4- oder WebM-Videos möglich." });
        continue;
      }
      if (datei.size > MEDIEN_MAX_BYTES) {
        aendere(id, { status: "fehler", meldung: `Zu groß – höchstens ${formatGroesse(MEDIEN_MAX_BYTES)}.` });
        continue;
      }
      try {
        const blob = await uploadPresigned(`${ordner}/${sichererDateiname(datei.name)}`, datei, {
          access: "public",
          handleUploadUrl: "/api/medien/upload",
          contentType: datei.type,
          multipart: datei.size > 20 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => aendere(id, { prozent: Math.round(percentage) }),
        });
        aendere(id, { status: "fertig", prozent: 100, url: blob.url });
        einerOk = true;
      } catch (e: any) {
        aendere(id, { status: "fehler", meldung: e?.message || "Upload fehlgeschlagen." });
      }
    }
    if (einerOk) router.refresh();
  }

  return (
    <div className="au-medien-upload">
      <div
        className={`au-medien-drop${ueber ? " ueber" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setUeber(true);
        }}
        onDragLeave={() => setUeber(false)}
        onDrop={(e) => {
          e.preventDefault();
          setUeber(false);
          if (e.dataTransfer.files.length) hochladen(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") input.current?.click();
        }}
      >
        <strong>Video hierher ziehen oder klicken</strong>
        <span>MP4 oder WebM, bis {formatGroesse(MEDIEN_MAX_BYTES)} pro Datei · mehrere auf einmal möglich</span>
        <input
          ref={input}
          type="file"
          accept={Object.keys(MEDIEN_TYPEN).join(",")}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) hochladen(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {eintraege.length > 0 && (
        <ul className="au-medien-fortschritt">
          {eintraege.map((e) => (
            <li key={e.id} className={e.status}>
              <div className="au-medien-fortschritt-kopf">
                <span>{e.name} <small>· {formatGroesse(e.groesse)}</small></span>
                <span>{e.status === "laeuft" ? `${e.prozent} %` : e.status === "fertig" ? "hochgeladen ✓" : "Fehler"}</span>
              </div>
              {e.status !== "fehler" && (
                <span className="au-medien-balken"><span style={{ width: `${e.prozent}%` }} /></span>
              )}
              {e.meldung && <small className="au-medien-fehler">{e.meldung}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
