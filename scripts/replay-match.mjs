import { readFile, stat } from "node:fs/promises";
import { verifyReplay } from "../src/core/session.js";
try {
  const path = process.argv[2];
  if (!path) throw Error("Uso: npm run replay:verify -- caminho/partida.json");
  if ((await stat(path)).size > 32 * 1024 * 1024)
    throw Error("Replay excede 32 MiB");
  const replay = JSON.parse(await readFile(path, "utf8"));
  console.error(
    `Runtime da gravação: ${replay.runtime ?? "não informado"}; verificador: Node ${process.version}`,
  );
  console.log(JSON.stringify(verifyReplay(replay), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
