import { getAktuellerBenutzer } from "@/lib/auth";
import Sidebar from "./Sidebar";
import "./globals.css";

export const metadata = { title: "AgencyUplifted Backend" };

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
