import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgencyUplifted Backend",
  // Kein "manifest" mehr hier: das manifest.json triggert in Chrome (Desktop)
  // bei jedem Aufruf erneut das "App installieren"-Icon/Prompt. Markus hat
  // die Seite bereits einmal manuell im Dock installiert -- das bleibt
  // bestehen, auch ohne den Manifest-Link im <head>. Fuer iOS "Zum
  // Home-Bildschirm" reichen apple-touch-icon + appleWebApp unten weiterhin.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AgencyUplifted",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1b33",
};

// Bewusst schlank: dieses Root-Layout liefert nur html/body + globale
// Styles. Die eigentliche Backstage-Optik (Sidebar, au-container) lebt in
// app/(backstage)/layout.tsx, damit /login und die oeffentlichen
// /wissen-Seiten NICHT in der Admin-Sidebar landen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
