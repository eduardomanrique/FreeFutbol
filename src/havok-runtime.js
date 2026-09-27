import HavokPhysics from "@babylonjs/havok";
// Vite emits the WASM alongside the game; Node workers read the same installed
// binary. No CDN or browser globals are required by the authoritative server.
let options;
if (typeof window === "undefined") {
  const nodeFsModule = "node:fs/promises";
  const fs = await import(/* @vite-ignore */ nodeFsModule);
  options = {
    wasmBinary: await fs.readFile(
      new URL(
        "../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm",
        import.meta.url,
      ),
    ),
  };
} else {
  const { default: wasmUrl } =
    await import("@babylonjs/havok/lib/esm/HavokPhysics.wasm?url");
  options = { locateFile: () => wasmUrl };
}
export const havok = await HavokPhysics(options);
