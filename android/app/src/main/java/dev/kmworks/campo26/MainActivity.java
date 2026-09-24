package dev.kmworks.campo26;

import android.content.Context;
import android.hardware.input.InputManager;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity implements InputManager.InputDeviceListener {
    private InputManager inputManager;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeGamepadPlugin.class);
        super.onCreate(savedInstanceState);
        inputManager = (InputManager) getSystemService(Context.INPUT_SERVICE);
        inputManager.registerInputDeviceListener(this, null);
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        return NativeGamepadPlugin.handleKeyEvent(event) || super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        return NativeGamepadPlugin.handleMotionEvent(event) || super.dispatchGenericMotionEvent(event);
    }

    @Override
    public void onInputDeviceAdded(int deviceId) {
        NativeGamepadPlugin.connect(deviceId);
    }

    @Override
    public void onInputDeviceRemoved(int deviceId) {
        NativeGamepadPlugin.disconnect(deviceId);
    }

    @Override
    public void onInputDeviceChanged(int deviceId) {
        NativeGamepadPlugin.connect(deviceId);
    }

    @Override
    public void onDestroy() {
        if (inputManager != null) inputManager.unregisterInputDeviceListener(this);
        super.onDestroy();
    }
}
