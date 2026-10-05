import { list, type ListBlobResultBlob } from "@vercel/blob";

// Server-Teil des Medien-Uploads. Token kommt aus der Verbindung des
// Blob-Stores mit dem Vercel-Projekt (BLOB_READ_WRITE_TOKEN), nie aus dem Repo.

export function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN fehlt: Blob-Store „agencyuplifted-media“ in Vercel mit dem Projekt verbinden (Storage → agencyuplifted-media → Connect Project) und neu deployen."
    );
  }
  return token;
}

export const blobVerbunden = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// Alle Dateien, neueste zuerst. list() liefert hoechstens 1000 pro Seite.
export async function ladeMedien(): Promise<ListBlobResultBlob[]> {
  const token = getBlobToken();
  const alle: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const seite = await list({ token, cursor, limit: 1000 });
    alle.push(...seite.blobs);
    cursor = seite.hasMore ? seite.cursor : undefined;
  } while (cursor);
  return alle.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}
