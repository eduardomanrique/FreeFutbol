const remoteOrigin = import.meta.env.VITE_GAME_API_ORIGIN || "";

export function apiEndpoint(path) {
  return new URL(path, remoteOrigin || location.origin).href;
}

export function socketEndpoint(path) {
  const url = new URL(path, remoteOrigin || location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}
