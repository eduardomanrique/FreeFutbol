import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve("output/motion-review");
fs.mkdirSync(root, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"],
});
const page = await browser.newPage({
  viewport: { width: 840, height: 630 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
function caption(stage) {
  const labels = {
    idle: "Parado",
    walking: "Caminhando",
    running: "Correndo",
    flight: "Fase aérea da passada",
    turning: "Transferência de apoio",
    braking: "Desaceleração",
    plant: "Apoio para a virada",
    touch: "Preparação do toque",
    settle: "Passos curtos de freada",
    pivot: "Conclusão do giro",
    exit: "Saída na nova direção",
    prepare: "Preparação",
    airborne: "Salto",
    recover: "Recuperação",
    slide: "Deslizamento",
    sit: "Apoio sentado",
    "push-up": "Impulsão com as mãos",
    fall: "Descida",
    stand: "Levantando",
    back: "Apoio de costas",
    load: "Preparação da impulsão",
    launch: "Impulsão e extensão",
    set: "Posição de espera",
    dive: "Defesa",
    foot: "Pé",
    inside: "Chapa",
    outside: "Trivela",
    cross: "Cruzado",
    heel: "Calcanhar",
    "high-heel": "Calcanhar alto",
    thigh: "Coxa",
    chest: "Peito",
    shoulder: "Ombro",
    head: "Testa",
    bicycle: "Bicicleta",
    around: "Volta ao mundo",
    orbit: "Volta da perna",
    instep: "Peito do pé",
    dribble: "Condução",
    "sole-stop": "Parada com a sola",
  };
  return stage
    .split(":")
    .filter((v) => !/^\d+$/.test(v))
    .map((v) => labels[v] || (/^\d+$/.test(v) ? `etapa ${Number(v) + 1}` : v))
    .join(" · ");
}
try {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "getGamepads", { value: () => [] }),
  );
  await page.goto(
    process.env.MOTION_REVIEW_URL || "http://localhost:5173/?test",
  );
  await page.waitForFunction(() => window.__test);
  await page.click("#start-btn");
  const specs = await page.evaluate(async () => {
    const { installReview, scenarios } =
      await import("/scripts/motion-review-scenarios.js");
    const { match: m, stadium: s } = window.__test;
    window.motionReview = installReview(m, s);
    document
      .querySelectorAll("body > *:not(#world), #world ~ *")
      .forEach((e) => (e.style.visibility = "hidden"));
    s.renderer.domElement.style.visibility = "visible";
    s.renderer.domElement.parentElement.style.visibility = "visible";
    return scenarios;
  });
  const manifest = [];
  for (const spec of specs.filter(
    (s) =>
      !process.env.MOTION_REVIEW_ONLY ||
      new RegExp(process.env.MOTION_REVIEW_ONLY).test(s.id),
  )) {
    fs.mkdirSync(path.join(root, spec.id), { recursive: true });
    const probe = await page.evaluate((g) => {
      motionReview.begin(g);
      return motionReview.advance(g.duration);
    }, spec);
    const events = probe.events.filter((e) =>
      /contato|plant|touch|settle|pivot|load|launch|sit|push-up|peito|dive|airborne|sole-stop|impulsão|:back|:stand|toque:cut|toque:stop/.test(
        e.label,
      ),
    );
    let times = [];
    const add = (t) => {
      t = Math.round(t * 120) / 120;
      if (
        t >= 0 &&
        t <= spec.duration &&
        times.every((old) => Math.abs(t - old) >= 0.055)
      )
        times.push(t);
    };
    const hit = events.find((e) => e.label.startsWith("contato:"));
    add(0);
    add(spec.duration);
    if (hit) {
      add(hit.t);
      add(hit.t - 0.075);
      add(hit.t + 0.1);
    }
    for (const e of events
      .filter((e) => e.label === "toque:cut")
      .slice(0, spec.angle === 90 && spec.run ? 2 : 1)) {
      add(e.t);
      add(e.t - 0.075);
      add(e.t + 0.1);
    }
    const stop = events.find((e) => e.label === "toque:stop");
    if (stop) {
      add(stop.t);
      add(stop.t - 0.075);
    }
    if (spec.kind === "bicycle" || spec.id === "bicicleta-altinha") {
      const launch = events.find((e) => e.label === "bicicleta:launch");
      if (launch) add(launch.t - 0.025);
    }
    for (const e of events.filter((e) => e.label.includes("impulsão")))
      add(e.t);
    for (const e of events
      .filter((e) => !e.label.startsWith("toque:"))
      .slice(0, 6))
      add(e.t + 0.04);
    for (let i = 1; i < 6; i++) add((spec.duration * i) / 6);
    times.sort((a, b) => a - b);
    await page.evaluate((g) => motionReview.begin(g), spec);
    const states = [];
    for (let i = 0; i < times.length; i++) {
      const state = await page.evaluate((t) => {
        const state = motionReview.advance(t);
        motionReview.draw();
        return state;
      }, times[i]);
      states.push(state);
      await page.locator("#world canvas").screenshot({
        path: path.join(root, spec.id, `${String(i + 1).padStart(2, "0")}.png`),
      });
    }
    manifest.push({ ...spec, times, states, events: probe.events });
    console.log(`${spec.id}: ${times.length} quadros · ${probe.stage}`);
  }
  if (errors.length) throw Error(errors.join("\n"));
  const all =
    process.env.MOTION_REVIEW_ONLY &&
    fs.existsSync(path.join(root, "manifest-live.json"))
      ? JSON.parse(fs.readFileSync(path.join(root, "manifest-live.json")))
          .filter((g) => !manifest.some((n) => n.id === g.id))
          .concat(manifest)
      : manifest;
  all.sort(
    (a, b) =>
      specs.findIndex((g) => g.id === a.id) -
      specs.findIndex((g) => g.id === b.id),
  );
  fs.writeFileSync(
    path.join(root, "manifest-live.json"),
    JSON.stringify(all, null, 2),
  );
  fs.writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify(all, null, 2),
  );
  const cards = all
    .map(
      (g) =>
        `<section id="${g.id}"><h2>${g.title}</h2><div class="frames">${g.times
          .map((t, i) => {
            const file = `${g.id}/${String(i + 1).padStart(2, "0")}.png`;
            const version = Math.trunc(
              fs.statSync(path.join(root, file)).mtimeMs,
            );
            const src = `${file}?v=${version}`;
            return `<figure><a href="${src}" target="_blank"><img loading="lazy" src="${src}" alt="${g.title}, quadro ${i + 1}"></a><figcaption><b>${String(i + 1).padStart(2, "0")}</b> · ${Math.round(t * 1000)} ms<br>${caption(g.states[i].stage)}</figcaption></figure>`;
          })
          .join("")}</div></section>`,
    )
    .join("");
  fs.writeFileSync(
    path.join(root, "index.html"),
    `<!doctype html><html lang="pt"><meta charset="utf-8"><title>CAMPO · revisão dos movimentos</title><style>body{margin:0;background:#10241d;color:#edf4e9;font:16px system-ui}header{padding:22px 24px;border-bottom:1px solid #44634e}h1{margin:0;font-size:26px}p{color:#bfd1c0;max-width:1000px;line-height:1.5}main{padding:18px 24px}section{margin-bottom:36px}h2{font-size:20px}.frames{display:flex;gap:10px;overflow-x:auto;padding-bottom:12px}figure{margin:0;flex:0 0 320px;background:#1b3427;border:1px solid #41664b}img{display:block;width:320px}figcaption{padding:9px 12px;font-size:13px;color:#d7e5d2;line-height:1.5}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#bde59f}</style><header><h1>CAMPO · movimentos quadro a quadro</h1><p>${all.length} sequências · ${all.reduce((n, g) => n + g.times.length, 0)} quadros · todos os jogadores destros.<br>Capturas de ações executadas pela simulação, com bola e contato reais. A posição inicial é preparada para cada cenário. Cada faixa mostra a ação, o contato e a recuperação; clique no quadro para ampliar.</p><nav>${all.map((g) => `<a href="#${g.id}">${g.title}</a>`).join("")}</nav></header><main>${cards}</main></html>`,
  );
  console.log(`Galeria: ${root}/index.html`);
} finally {
  await browser.close();
}
