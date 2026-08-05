import type { Metadata, Viewport } from "next";
import { getAktuellerBenutzer } from "@/lib/auth";
import Sidebar from "./Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgencyUplifted Backend",
  manifest: "/manifest.json",
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#102a4c",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const benutzer = await getAktuellerBenutzer();

  return (
    <html lang="de">
      <body>
        <div className="au-app">
          <Sidebar benutzerName={benutzer?.name} />
          <div className="au-main">
            <div className="au-container">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
