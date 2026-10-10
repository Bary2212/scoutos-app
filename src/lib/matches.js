// Společné pomůcky pro plánovač zápasů (stránka Zápasy i karta na Dashboardu).

export const MATCH_STATUS = {
  prideleno: { label: "Čeká na potvrzení", bg: "#F4EBDB", fg: "#C98A2C" },
  potvrzeno: { label: "Potvrzeno", bg: "#E4EEE7", fg: "#2F6B4F" },
  odmitnuto: { label: "Odmítnuto", bg: "#F5E5E2", fg: "#B23A2E" },
  odehrano: { label: "Odehráno", bg: "#EAEBE4", fg: "#57614F" },
};

export function formatKickoff(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
  const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

// Zápas se ještě počítá jako nadcházející, i když začal před max. 3 hodinami.
export function isUpcoming(match) {
  return new Date(match.kickoff).getTime() >= Date.now() - 3 * 60 * 60 * 1000;
}

// ISO čas -> hodnota pro <input type="datetime-local"> v čase uživatele.
export function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
