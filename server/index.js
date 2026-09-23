import http from "node:http";
import { TeamRelay, relayFrameFor } from "./team-relay.js";
import { encodeTeamMessage } from "../shared/team-protocol.js";
import { resolveOrigins } from "./origins.js";
import { randomBytes, randomInt } from "node:crypto";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { PROTOCOL_VERSION, parseInput } from "../shared/protocol.js";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const token = () => randomBytes(32).toString("base64url");
const send = (socket, data) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
};
export function createGameServer(options = {}) {
  const maxRooms = options.maxRooms ?? Number(process.env.MAX_ROOMS || 8);
  const maxMatches = options.maxMatches ?? Number(process.env.MAX_MATCHES || 2);
  const reconnectMs = options.reconnectMs ?? 30000;
  const lobbyMs = options.lobbyMs ?? 15 * 60000;
  const allowedOrigins = resolveOrigins(options.origins);
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === "1";
  const address = (req) =>
    trustProxy && req.headers["x-forwarded-for"]
      ? String(req.headers["x-forwarded-for"]).split(",").at(-1).trim()
      : req.socket.remoteAddress;
  const rooms = new Map(),
    sessions = new Map(),
    rates = new Map();
  let closing = false;
  const log = (event, extra = {}) => {
    if (!options.quiet)
      console.log(
        JSON.stringify({ time: new Date().toISOString(), event, ...extra }),
      );
  };
  function allow(key, limit, windowMs = 60000) {
    const now = Date.now();
    let bucket = rates.get(key);
    if (!bucket || now > bucket.until) {
      bucket = { n: 0, until: now + windowMs };
      rates.set(key, bucket);
    }
    return ++bucket.n <= limit;
  }
  function describe(room) {
    return {
      code: room.code,
      status: room.status,
      networkMode: room.networkMode || "server",
      duration: room.duration,
      players: room.players.map(
        (p) => p && { team: p.team, connected: !!p.socket, ready: p.ready },
      ),
      expiresAt: room.worker || room.relay ? null : room.activity + lobbyMs,
    };
  }
  function broadcast(room) {
    for (const p of room.players)
      send(p?.socket, { type: "room", room: describe(room) });
  }
  function closeRoom(room, reason) {
    if (rooms.get(room.code) !== room) return;
    rooms.delete(room.code);
    clearTimeout(room.startTimer);
    room.worker?.terminate();
    for (const p of room.players)
      if (p) {
        sessions.delete(p.token);
        send(p.socket, { type: "closed", reason });
        p.socket?.close(1000, "Room closed");
      }
    log("room.closed", { code: room.code, reason });
  }
  function member(room, team) {
    const p = {
      token: token(),
      room,
      team,
      socket: null,
      ready: false,
      disconnectedAt: Date.now(),
      seq: -1,
    };
    room.players[team] = p;
    sessions.set(p.token, p);
    return p;
  }
  function reply(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(body));
  }
  const server = http.createServer(async (req, res) => {
    const path = req.url?.split("?")[0];
    if (req.method === "GET" && path === "/futebol/api/healthz")
      return reply(res, closing ? 503 : 200, {
        ok: !closing,
        protocol: PROTOCOL_VERSION,
        rooms: rooms.size,
        matches: [...rooms.values()].filter((r) => r.worker || r.relay).length,
      });
    if (
      closing ||
      req.method !== "POST" ||
      !["/futebol/api/rooms", "/futebol/api/rooms/join"].includes(path)
    )
      return reply(res, 404, { error: "Rota não encontrada." });
    if (!allowedOrigins.includes(req.headers.origin))
      return reply(res, 403, { error: "Origem não autorizada." });
    if (!allow(`http:${address(req)}`, 40))
      return reply(res, 429, {
        error: "Muitas tentativas. Aguarde um minuto.",
      });
    let body;
    try {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 2048) {
          reply(res, 413, { error: "Pedido muito grande." });
          return;
        }
      }
      body = JSON.parse(text);
    } catch {
      return reply(res, 400, { error: "Pedido inválido." });
    }
    if (body?.version !== PROTOCOL_VERSION)
      return reply(res, 409, {
        error: "Versão incompatível. Atualize a página.",
      });
    let room, player;
    if (path.endsWith("/join")) {
      room = rooms.get(String(body.code || "").toUpperCase());
      if (!room)
        return reply(res, 404, { error: "Sala não encontrada ou expirada." });
      if (room.networkMode === "teams" && body.teamProtocol !== 1)
        return reply(res, 409, {
          error: "Esta sala precisa da versão experimental por times.",
        });
      if (room.status !== "waiting" || room.players[1])
        return reply(res, 409, { error: "Sala cheia ou partida iniciada." });
      player = member(room, 1);
    } else {
      if (body.networkMode === "teams" && body.teamProtocol !== 1)
        return reply(res, 409, {
          error: "Protocolo experimental incompatível.",
        });
      if (rooms.size >= maxRooms)
        return reply(res, 503, {
          error: "Servidor cheio. Tente novamente mais tarde.",
        });
      if (![180, 360, 600].includes(body.duration))
        return reply(res, 400, { error: "Duração inválida." });
      let code;
      do {
        code = Array.from(
          { length: 6 },
          () => alphabet[randomInt(alphabet.length)],
        ).join("");
      } while (rooms.has(code));
      room = {
        code,
        status: "waiting",
        duration: body.duration,
        networkMode: body.networkMode === "teams" ? "teams" : "server",
        players: [null, null],
        activity: Date.now(),
        worker: null,
      };
      rooms.set(code, room);
      player = member(room, 0);
      log("room.created", { code });
    }
    room.activity = Date.now();
    broadcast(room);
    reply(res, 201, {
      token: player.token,
      team: player.team,
      room: describe(room),
      version: PROTOCOL_VERSION,
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32768,
    perMessageDeflate: {
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
      concurrencyLimit: 4,
      threshold: 1024,
      zlibDeflateOptions: { level: 1 },
    },
  });
  server.on("upgrade", (req, socket, head) => {
    if (
      closing ||
      req.url !== "/futebol/api/ws" ||
      !allowedOrigins.includes(req.headers.origin) ||
      wss.clients.size >= maxRooms * 4 + 8 ||
      !allow(`ws:${address(req)}`, 60)
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  function startMatch(room) {
    if (room.status !== "waiting") return;
    if (room.players.some((p) => !p?.socket || !p.ready))
      throw new Error("Os dois jogadores precisam estar conectados e prontos.");
    if (
      [...rooms.values()].filter((r) => r.worker || r.relay).length >=
      maxMatches
    )
      throw new Error(
        "Todas as vagas de partida estão ocupadas. Tente em instantes.",
      );
    if (room.networkMode === "teams") {
      room.relay = new TeamRelay(room.duration);
      for (const p of room.players) p.lastTeamAt = Date.now();
      room.status = "playing";
      broadcast(room);
      for (const p of room.players) send(p.socket, room.relay.snapshot());
      log("match.started", { code: room.code, networkMode: "teams" });
      return;
    }
    room.status = "starting";
    broadcast(room);
    const worker = (room.worker = new Worker(
      new URL("./match-worker.js", import.meta.url),
      {
        workerData: { duration: room.duration },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      },
    ));
    room.startTimer = setTimeout(
      () => closeRoom(room, "Não foi possível iniciar a simulação."),
      20000,
    );
    worker.on("message", (msg) => {
      if (rooms.get(room.code) !== room) return;
      if (msg.type === "ready") {
        clearTimeout(room.startTimer);
        room.status = room.players.every((p) => p?.socket)
          ? "playing"
          : "reconnecting";
        worker.postMessage({ type: "pause", value: room.status !== "playing" });
        broadcast(room);
        log("match.started", { code: room.code });
      }
      if (msg.type === "snapshot") {
        room.latest = msg.payload;
        room.metrics = msg.metrics;
        if (msg.finished && room.status !== "finished") {
          room.status = "finished";
          room.activity = Date.now();
          broadcast(room);
          log("match.finished", { code: room.code, metrics: msg.metrics });
        }
        for (const p of room.players)
          if (p?.socket?.readyState === WebSocket.OPEN) {
            // Avoid a queue of obsolete states; disconnect a persistently stalled reader.
            if (p.socket.bufferedAmount > 1024 * 1024) {
              p.socket.terminate();
              continue;
            }
            if (p.socket.bufferedAmount < 128 * 1024)
              p.socket.send(msg.payload);
          }
      }
    });
    worker.on("error", (error) => {
      log("worker.error", { message: error.message });
      closeRoom(room, "A simulação foi interrompida.");
    });
    worker.on("exit", () => {
      if (rooms.has(room.code)) closeRoom(room, "A simulação foi encerrada.");
    });
  }
  wss.on("connection", (ws) => {
    let player = null,
      count = 0,
      interval = Date.now();
    ws.alive = true;
    ws.on("pong", () => {
      ws.alive = true;
    });
    const authTimer = setTimeout(
      () => ws.close(1008, "Authentication timeout"),
      5000,
    );
    ws.on("error", () => {});
    ws.on("message", (data) => {
      if (Date.now() - interval > 1000) {
        interval = Date.now();
        count = 0;
      }
      if (++count > 90) {
        ws.close(1008, "Rate limit");
        return;
      }
      try {
        const msg = JSON.parse(data.toString());
        if (!player) {
          if (
            msg.type !== "auth" ||
            msg.version !== PROTOCOL_VERSION ||
            typeof msg.token !== "string"
          )
            throw new Error("Sessão inválida.");
          player = sessions.get(msg.token);
          if (!player) {
            ws.close(1008, "Invalid session");
            return;
          }
          if (player.room.networkMode === "teams" && msg.teamProtocol !== 1) {
            player = null;
            ws.close(1008, "Team protocol mismatch");
            return;
          }
          clearTimeout(authTimer);
          const old = player.socket;
          player.socket = ws;
          old?.close(1000, "Session replaced");
          player.disconnectedAt = null;
          player.lastTeamAt = Date.now();
          const room = player.room;
          room.activity = Date.now();
          send(ws, {
            type: "authenticated",
            team: player.team,
            sequence: player.seq,
          });
          if (
            room.status === "reconnecting" &&
            room.players.every((p) => p?.socket)
          ) {
            room.status = "playing";
            room.worker?.postMessage({ type: "pause", value: false });
            room.relay?.pause(false);
          }
          broadcast(room);
          if (room.relay) {
            // Resume both clocks and invalidate old speculative contact claims.
            for (const p of room.players)
              if (p?.socket) send(p.socket, room.relay.snapshot());
          }
          if (room.latest) ws.send(room.latest);
          return;
        }
        if (player.socket !== ws) return;
        const room = player.room;
        if (msg.type === "ping") {
          send(ws, { type: "pong", sent: msg.sent, at: room.relay?.time() });
          return;
        }
        if (msg.type === "leave") {
          closeRoom(room, "Um jogador saiu da sala.");
          return;
        }
        if (msg.type === "ready" && room.status === "waiting") {
          player.ready = msg.value === true;
          room.activity = Date.now();
          broadcast(room);
          return;
        }
        if (msg.type === "start") {
          if (player.team !== 0)
            throw new Error("Somente o criador pode iniciar.");
          startMatch(room);
          return;
        }
        if (msg.type === "team" && room.status === "playing" && room.relay) {
          const frame = room.relay.receive(player.team, msg);
          if (!frame) return;
          player.seq = msg.seq;
          player.lastTeamAt = Date.now();

          for (const p of room.players)
            if (p?.socket?.readyState === WebSocket.OPEN) {
              // Events cannot be skipped like snapshots. A slow reader must resync.
              if (p.socket.bufferedAmount > 128 * 1024) p.socket.terminate();
              else {
                const reply = relayFrameFor(frame, p.team);
                if (reply) p.socket.send(encodeTeamMessage(reply));
              }
            }
          if (room.relay.ball?.mode === "finished") {
            room.status = "finished";
            room.activity = Date.now();
            broadcast(room);
          }
          return;
        }
        if (msg.type === "input" && room.status === "playing" && room.worker) {
          const input = parseInput(msg.input);
          if (!input) throw new Error("Comando inválido.");
          if (input.seq <= player.seq) return;
          player.seq = input.seq;
          room.worker.postMessage({ type: "input", team: player.team, input });
          return;
        }
      } catch (error) {
        send(ws, {
          type: "error",
          error: error.message || "Mensagem inválida.",
        });
      }
    });
    ws.on("close", () => {
      clearTimeout(authTimer);
      if (!player || player.socket !== ws || !rooms.has(player.room.code))
        return;
      player.socket = null;
      player.disconnectedAt = Date.now();
      player.ready = false;
      const room = player.room;
      if (room.status === "playing") {
        room.status = "reconnecting";
        room.worker?.postMessage({ type: "pause", value: true });
        room.relay?.pause(true);
      }
      broadcast(room);
    });
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rates) if (now > value.until) rates.delete(key);
    for (const room of rooms.values()) {
      if (room.relay && room.status === "playing")
        for (const p of room.players)
          if (p.socket && now - p.lastTeamAt > 5000) p.socket.terminate();
      if (
        room.players.some(
          (p) => p && !p.socket && now - p.disconnectedAt > reconnectMs,
        )
      )
        closeRoom(room, "O prazo de reconexão terminou.");
      else if (
        ((!room.worker && !room.relay) || room.status === "finished") &&
        now - room.activity > lobbyMs
      )
        closeRoom(room, "Sala expirada.");
    }
  }, 1000);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 10000);
  cleanup.unref();
  heartbeat.unref();
  async function close() {
    closing = true;
    clearInterval(cleanup);
    clearInterval(heartbeat);
    for (const room of [...rooms.values()])
      closeRoom(room, "Servidor reiniciando.");
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  }
  return { server, rooms, close };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createGameServer();
  app.server.listen(
    Number(process.env.PORT || 8787),
    process.env.HOST || "127.0.0.1",
    () => console.log("CAMPO backend listening on", app.server.address()),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => app.close().then(() => process.exit(0)));
}
