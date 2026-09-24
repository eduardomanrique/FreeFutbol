package dev.kmworks.campo26;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "NativeGamepad")
public class NativeGamepadPlugin extends Plugin {
    private static volatile NativeGamepadPlugin active;
    private static final Map<Integer, PadState> states = new ConcurrentHashMap<>();

    @PluginMethod
    public void start(PluginCall call) {
        active = this;
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice device = InputDevice.getDevice(id);
            if (isGamepad(device)) publish(device, states.computeIfAbsent(id, k -> new PadState()));
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (active == this) active = null;
        call.resolve();
    }

    static boolean handleKeyEvent(KeyEvent event) {
        NativeGamepadPlugin plugin = active;
        if (plugin == null || (!event.isFromSource(InputDevice.SOURCE_GAMEPAD)
                && !event.isFromSource(InputDevice.SOURCE_DPAD))) return false;
        int button = buttonIndex(event.getKeyCode());
        if (button < 0 || (event.getAction() != KeyEvent.ACTION_DOWN
                && event.getAction() != KeyEvent.ACTION_UP)) return false;
        InputDevice device = InputDevice.getDevice(event.getDeviceId());
        if (!isGamepad(device)) return false;
        PadState state = states.computeIfAbsent(device.getId(), k -> new PadState());
        float value = event.getAction() == KeyEvent.ACTION_DOWN ? 1f : 0f;
        if (Math.abs(state.buttons[button] - value) > 0.001f) {
            state.buttons[button] = value;
            publish(device, state);
        }
        return true;
    }

    static boolean handleMotionEvent(MotionEvent event) {
        NativeGamepadPlugin plugin = active;
        if (plugin == null || (!event.isFromSource(InputDevice.SOURCE_JOYSTICK)
                && !event.isFromSource(InputDevice.SOURCE_GAMEPAD))) return false;
        InputDevice device = InputDevice.getDevice(event.getDeviceId());
        if (!isGamepad(device)) return false;
        PadState state = states.computeIfAbsent(device.getId(), k -> new PadState());
        float[] oldButtons = state.buttons.clone();
        float[] axes = {
            event.getAxisValue(MotionEvent.AXIS_X),
            event.getAxisValue(MotionEvent.AXIS_Y),
            event.getAxisValue(MotionEvent.AXIS_Z),
            event.getAxisValue(MotionEvent.AXIS_RZ)
        };
        state.buttons[6] = Math.max(0f, event.getAxisValue(MotionEvent.AXIS_LTRIGGER));
        state.buttons[7] = Math.max(0f, event.getAxisValue(MotionEvent.AXIS_RTRIGGER));
        float hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X);
        float hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y);
        state.buttons[12] = hatY < -0.5f ? 1f : 0f;
        state.buttons[13] = hatY > 0.5f ? 1f : 0f;
        state.buttons[14] = hatX < -0.5f ? 1f : 0f;
        state.buttons[15] = hatX > 0.5f ? 1f : 0f;
        boolean changed = false;
        for (int i = 0; i < axes.length; i++) {
            if (Math.abs(state.axes[i] - axes[i]) > 0.005f) changed = true;
            state.axes[i] = axes[i];
        }
        for (int i : new int[] {6, 7, 12, 13, 14, 15}) {
            if (Math.abs(oldButtons[i] - state.buttons[i]) > 0.005f) changed = true;
        }
        publish(device, state, changed);
        return true;
    }

    static void connect(int deviceId) {
        InputDevice device = InputDevice.getDevice(deviceId);
        if (!isGamepad(device) || active == null) return;
        publish(device, states.computeIfAbsent(deviceId, k -> new PadState()));
    }

    static void disconnect(int deviceId) {
        NativeGamepadPlugin plugin = active;
        PadState removed = states.remove(deviceId);
        if (plugin == null || removed == null) return;
        InputDevice device = InputDevice.getDevice(deviceId);
        plugin.emit(deviceId, device == null ? "Controller" : device.getName(), false,
                new float[4], new float[17]);
    }

    private static int buttonIndex(int key) {
        switch (key) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return 8;
            case KeyEvent.KEYCODE_BUTTON_START: return 9;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 10;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 11;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            default: return -1;
        }
    }

    private static boolean isGamepad(InputDevice device) {
        return device != null && (device.supportsSource(InputDevice.SOURCE_GAMEPAD)
                || device.supportsSource(InputDevice.SOURCE_JOYSTICK)
                || device.supportsSource(InputDevice.SOURCE_DPAD));
    }

    private static void publish(InputDevice device, PadState state) {
        publish(device, state, true);
    }

    private static void publish(InputDevice device, PadState state, boolean changed) {
        if (!changed || active == null) return;
        active.emit(device.getId(), device.getName(), true, state.axes, state.buttons);
    }

    private void emit(int index, String name, boolean connected, float[] axes, float[] buttons) {
        JSObject value = new JSObject();
        value.put("index", index);
        value.put("name", name);
        value.put("connected", connected);
        ArrayList<Double> axisValues = new ArrayList<>(axes.length);
        for (float axis : axes) axisValues.add((double) axis);
        ArrayList<Double> buttonValues = new ArrayList<>(buttons.length);
        for (float button : buttons) buttonValues.add((double) button);
        value.put("axes", axisValues);
        value.put("buttons", buttonValues);
        notifyListeners("gamepadChange", value);
    }

    private static final class PadState {
        final float[] axes = new float[4];
        final float[] buttons = new float[17];
    }
}
