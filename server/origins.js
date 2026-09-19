import { networkInterfaces } from "node:os";

// Development accepts only this machine's private IPv4 addresses, never an
// arbitrary LAN Origin. Production uses its explicit ALLOWED_ORIGINS list.
export function developmentOrigins(interfaces = networkInterfaces()) {
  const origins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
  for (const addresses of Object.values(interfaces)) {
    for (const entry of addresses || []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      const octets = entry.address.split(".").map(Number);
      const privateAddress =
        octets[0] === 10 ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168);
      if (privateAddress) origins.add(`http://${entry.address}:5173`);
    }
  }
  return [...origins];
}

export function resolveOrigins(explicit, environment = process.env) {
  if (explicit !== undefined) return explicit;
  if (environment.ALLOWED_ORIGINS !== undefined)
    return environment.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  return environment.NODE_ENV === "production"
    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
    : developmentOrigins();
}
