import { Match } from "../../src/simulation.js";
import { TeamSimulation } from "../../src/network/team-simulation.js";
import { TeamRelay, relayFrameFor } from "../../server/team-relay.js";
import { encodeTeamMessage } from "../../shared/team-protocol.js";
export function createPair(delay = 0) {
  let clock = 0;
  const relay = new TeamRelay(180, () => clock * 1000),
    queue = [],
    failures = [];
  const matches = [0, 1].map(
    () => new Match({ multiplayer: true, headless: true, random: () => 0.5 }),
  );
  const sessions = [0, 1].map(
    (team) =>
      new TeamSimulation(team, (packet) => {
        // JSON roundtrip reproduces the actual wire, including absent fields/rounding.
        queue.push({
          at: clock + delay / 2,
          team,
          packet: JSON.parse(encodeTeamMessage(packet)),
        });
      }),
  );
  for (const s of sessions) s.receive(relay.snapshot());
  function deliver() {
    for (let i = 0; i < queue.length;) {
      if (queue[i].at > clock) {
        i++;
        continue;
      }
      const e = queue.splice(i, 1)[0];
      if (e.packet) {
        try {
          const frame = relay.receive(e.team, e.packet);
          if (frame)
            queue.push({
              at: clock + delay / 2,
              frame: JSON.parse(encodeTeamMessage(frame)),
            });
        } catch (error) {
          failures.push({ error: error.message, packet: e.packet });
          throw error;
        }
      } else
        for (const s of sessions) {
          const f = relayFrameFor(e.frame, s.team);
          if (f) s.receive(f, delay / 2);
        }
    }
  }
  function step(n = 1, inputs = [{}, {}]) {
    for (let i = 0; i < n; i++) {
      clock += 1 / 120;
      deliver();
      sessions.forEach((s, t) =>
        s.update(matches[t], 1 / 120, inputs[t], true),
      );
      deliver();
    }
  }
  step(2);
  return {
    matches,
    sessions,
    relay,
    step,
    queue,
    failures,
    dispose: () => matches.forEach((m) => m.physics.dispose()),
  };
}
