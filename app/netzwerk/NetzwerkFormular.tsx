"use client";

import { useActionState, type CSSProperties, type ReactNode } from "react";

type Ergebnis = { fehler: string | null; info?: string };

// Formular fuer Netzwerk-Server-Actions. Anders als AktionsFormular (Backstage)
// ohne try/catch um die Action: redirect() aus der Action muss bis zu Next.js
// durchlaufen, sonst landet "NEXT_REDIRECT" als Fehlertext im Formular.
export default function NetzwerkFormular({
  action,
  children,
  className,
  style,
}: {
  action: (formData: FormData) => Promise<Ergebnis | void>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const [zustand, ausfuehren, laeuft] = useActionState<Ergebnis | null, FormData>(async (_vorher, fd) => (await action(fd)) || null, null);
  return (
    <form action={ausfuehren} className={className} style={{ ...style, opacity: laeuft ? 0.6 : undefined }}>
      {children}
      {zustand?.fehler && <p className="ua-meldung ua-fehler">{zustand.fehler}</p>}
      {zustand?.info && <p className="ua-meldung ua-info">{zustand.info}</p>}
    </form>
  );
}
