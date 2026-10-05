"use client";

import { useState } from "react";

export default function UrlKopieren({ url }: { url: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <button
      type="button"
      className={`au-btn au-btn-sm ${kopiert ? "au-btn-secondary" : "au-btn-primary"}`}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setKopiert(true);
        setTimeout(() => setKopiert(false), 2000);
      }}
    >
      {kopiert ? "Kopiert ✓" : "URL kopieren"}
    </button>
  );
}
