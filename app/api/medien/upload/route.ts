import { NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { getAktuellerBenutzer } from "@/lib/auth";
import { MEDIEN_TYPEN, MEDIEN_MAX_BYTES, MEDIEN_CACHE_SEKUNDEN } from "@/lib/medien";

// Stellt presigned Upload-URLs aus: Die Datei geht vom Browser direkt zu
// Vercel Blob, sonst griffe das 4,5-MB-Limit der Funktionen. Liegt nicht unter
// /api/public -- die Middleware verlangt schon eine Backstage-Session, hier
// zusaetzlich geprueft.
//
// Presigned statt handleUpload: Die Store-Verbindung legt kein
// BLOB_READ_WRITE_TOKEN mehr an, sondern BLOB_STORE_ID + OIDC (Vercel-Login
// der Funktion). handleUpload braucht aber das Read-Write-Token,
// issueSignedToken/handleUploadPresigned laufen mit OIDC.
//
// Bewusst OHNE onUploadCompleted: Dieser Rueckruf kaeme von Vercel ohne
// Session-Cookie und braeuchte eine Ausnahme im Login-Schutz. Die Liste auf
// /medien liest ohnehin direkt aus dem Store.
export async function POST(request: Request) {
  const benutzer = await getAktuellerBenutzer();
  if (!benutzer) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  try {
    const body = (await request.json()) as HandleUploadPresignedBody;
    const antwort = await handleUploadPresigned({
      request,
      body,
      getSignedToken: async (pathname) => {
        // Ordner muss zum Typ passen ("videos/..."), nur bekannte Ordner.
        const ordner = pathname.split("/")[0];
        const typen = Object.entries(MEDIEN_TYPEN)
          .filter(([, o]) => o === ordner)
          .map(([t]) => t);
        if (!typen.length || pathname.split("/").length !== 2) throw new Error("Ungültiger Ablageort.");
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: typen,
          maximumSizeInBytes: MEDIEN_MAX_BYTES,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: typen,
            maximumSizeInBytes: MEDIEN_MAX_BYTES,
            addRandomSuffix: true,
            cacheControlMaxAge: MEDIEN_CACHE_SEKUNDEN,
          },
        };
      },
    });
    return NextResponse.json(antwort);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload nicht möglich." }, { status: 400 });
  }
}
