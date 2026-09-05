// Zugriff auf die WebinarGeek REST API v2 (https://app.webinargeek.com/api/v2).
// Der API-Key wird ausschliesslich serverseitig verwendet (in Vercel unter
// Project Settings -> Environment Variables als WEBINARGEEK_API_KEY hinterlegen)
// und darf niemals an den Client (Onepage) gelangen.

const WEBINARGEEK_BASE_URL = "https://app.webinargeek.com/api/v2";

function getApiKey(): string {
  const apiKey = process.env.WEBINARGEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "WEBINARGEEK_API_KEY ist nicht gesetzt. Bitte in Vercel unter Project Settings -> Environment Variables hinterlegen."
    );
  }
  return apiKey;
}

export type WebinarGeekSubscriptionResult =
  | {
      ok: true;
      confirmationLink?: string;
      watchLink?: string;
      emailVerified?: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

// Registriert eine Person fuer einen konkreten Termin (Broadcast) eines
// Webinars. Funktional identisch zur Registrierung ueber das WebinarGeek-
// Widget/Iframe: loest denselben Bestaetigungs-/Double-Opt-in-Mailversand und
// dieselben WebinarGeek-Integrationstrigger aus (u.a. die bestehende
// Zapier-Weitergabe an Quentn) - unabhaengig von der Registrierungsquelle.
// broadcastId = die konkrete Terminausgabe eines Webinars (nicht die
// Webinar-ID selbst); in WebinarGeek unter "Broadcasts" pro Termin zu finden.
export async function subscribeToBroadcast(params: {
  broadcastId: number;
  firstname: string;
  email: string;
  registrationIp?: string;
}): Promise<WebinarGeekSubscriptionResult> {
  const res = await fetch(`${WEBINARGEEK_BASE_URL}/broadcasts/${params.broadcastId}/subscriptions`, {
    method: "POST",
    headers: {
      "Api-Token": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      firstname: params.firstname,
      email: params.email,
      ...(params.registrationIp ? { registration_ip: params.registrationIp } : {}),
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, error: detail || res.statusText };
  }

  const data = await res.json().catch(() => ({} as any));
  return {
    ok: true,
    confirmationLink: data.confirmation_link,
    watchLink: data.watch_link,
    emailVerified: data.email_verified,
  };
}

export type WebinarGeekBroadcastResult =
  | {
      ok: true;
      title: string;
      startEpochSeconds: number;
      durationSeconds: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

// Liest Titel, Starttermin und geschaetzte Dauer eines Broadcasts (konkreter
// Webinar-Termin), z.B. um sie auf einer Onepage-Landingpage anzuzeigen.
// nested_resources=episode,webinar liefert Titel und Dauer gleich mit, ohne
// zusaetzliche Requests. Titel bevorzugt webinar.title (der eigentliche
// Webinar-Name), episode.title als Fallback (identisch, sofern das Webinar
// nur eine Episode hat).
export async function getBroadcastInfo(broadcastId: number): Promise<WebinarGeekBroadcastResult> {
  const res = await fetch(
    `${WEBINARGEEK_BASE_URL}/broadcasts/${broadcastId}?nested_resources=episode,webinar`,
    {
      headers: {
        "Api-Token": getApiKey(),
      },
    }
  );

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, error: detail || res.statusText };
  }

  const data = await res.json().catch(() => ({} as any));
  return {
    ok: true,
    title: data?.webinar?.title || data?.episode?.title || "",
    startEpochSeconds: data?.date,
    durationSeconds: data?.episode?.estimated_duration ?? 3600,
  };
}
