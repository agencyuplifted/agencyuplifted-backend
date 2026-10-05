import { list, type ListBlobResultBlob } from "@vercel/blob";

// Server-Teil des Medien-Uploads. Zugang kommt aus der Verbindung des
// Blob-Stores mit dem Vercel-Projekt, nie aus dem Repo: neuere Verbindungen
// setzen BLOB_STORE_ID und das SDK meldet sich per OIDC an (Token der
// Funktion), aeltere ein BLOB_READ_WRITE_TOKEN. Das SDK nimmt beides
// selbst -- deshalb hier kein token-Parameter.

export const blobVerbunden = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

// Alle Dateien, neueste zuerst. list() liefert hoechstens 1000 pro Seite.
export async function ladeMedien(): Promise<ListBlobResultBlob[]> {
  const alle: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const seite = await list({ cursor, limit: 1000 });
    alle.push(...seite.blobs);
    cursor = seite.hasMore ? seite.cursor : undefined;
  } while (cursor);
  return alle.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}
