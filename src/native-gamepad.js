import { Capacitor, registerPlugin } from "@capacitor/core";

if (Capacitor.isNativePlatform()) {
  globalThis.__campoUseNativeGamepads = true;
  globalThis.__campoNativeGamepads = [];
  const NativeGamepad = registerPlugin("NativeGamepad");
  const pads = new Map();
  NativeGamepad.addListener("gamepadChange", (state) => {
    if (!state.connected) pads.delete(state.index);
    else
      pads.set(state.index, {
        id: `CAMPO Native Gamepad ${state.name || state.index}`,
        index: state.index,
        connected: true,
        mapping: "standard",
        axes: state.axes,
        buttons: state.buttons.map((value) => ({
          value,
          pressed: value > 0.5,
        })),
        timestamp: performance.now(),
      });
    globalThis.__campoNativeGamepads = [...pads.values()];
  });
  NativeGamepad.start();
}
