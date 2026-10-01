import { redirect } from "next/navigation";
import { getAktuellerBenutzer } from "./auth";
import { getSupabaseAdmin } from "./supabase";

// Einfaches Rechtemanagement: Rolle 'admin' oder 'mitarbeiter' an der Tabelle
// mitarbeiter. Bewusst pro Anfrage aus der DB gelesen statt in der Session
// gespeichert -- eine Rollenaenderung wirkt sofort, ohne neu einzuloggen.
// Aktuell nur fuer das Dashboard (Umsatz/DB), Wunsch Markus 10/2026.

export type Rolle = "admin" | "mitarbeiter";

export async function ladeRolle(): Promise<Rolle | null> {
  const benutzer = await getAktuellerBenutzer();
  if (!benutzer) return null;
  const { data } = await getSupabaseAdmin().from("mitarbeiter").select("rolle, aktiv").eq("id", benutzer.id).maybeSingle();
  if (!data?.aktiv) return null;
  return data.rolle === "admin" ? "admin" : "mitarbeiter";
}

export async function istAdmin(): Promise<boolean> {
  return (await ladeRolle()) === "admin";
}

// Fuer Seiten: Nicht-Admins landen auf den Terminen statt auf einer Fehlerseite.
export async function requireAdmin(umleitung = "/termine"): Promise<void> {
  const rolle = await ladeRolle();
  if (rolle === null) redirect("/login");
  if (rolle !== "admin") redirect(umleitung);
}
