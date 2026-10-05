import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getAktuellerBenutzer } from "@/lib/auth";
import { getBlobToken } from "@/lib/medien-server";
import { MEDIEN_TYPEN, MEDIEN_MAX_BYTES, MEDIEN_CACHE_SEKUNDEN } from "@/lib/medien";

// Stellt Upload-Tokens fuer Client-Uploads aus: Die Datei geht vom Browser
// direkt zu Vercel Blob, sonst griffe das 4,5-MB-Limit der Funktionen.
// Liegt nicht unter /api/public -- die Middleware verlangt schon eine
// Backstage-Session, hier zusaetzlich geprueft.
//
// Bewusst OHNE onUploadCompleted: Dieser Rueckruf kaeme von Vercel ohne
// Session-Cookie und braeuchte eine Ausnahme im Login-Schutz. Die Liste auf
// /medien liest ohnehin direkt aus dem Store.
export async function POST(request: Request) {
  const benutzer = await getAktuellerBenutzer();
  if (!benutzer) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  try {
    const body = (await request.json()) as HandleUploadBody;
    const antwort = await handleUpload({
      token: getBlobToken(),
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // Ordner muss zum Typ passen ("videos/..."), nur bekannte Ordner.
        const ordner = pathname.split("/")[0];
        const typen = Object.entries(MEDIEN_TYPEN)
          .filter(([, o]) => o === ordner)
          .map(([t]) => t);
        if (!typen.length || pathname.split("/").length !== 2) throw new Error("Ungültiger Ablageort.");
        return {
          allowedContentTypes: typen,
          maximumSizeInBytes: MEDIEN_MAX_BYTES,
          addRandomSuffix: true,
          cacheControlMaxAge: MEDIEN_CACHE_SEKUNDEN,
        };
      },
    });
    return NextResponse.json(antwort);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload nicht möglich." }, { status: 400 });
  }
}
