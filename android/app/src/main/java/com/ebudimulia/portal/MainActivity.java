package com.ebudimulia.portal;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Safeguard against Chromium/Capacitor redundant permission callback crash
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            if (throwable instanceof IllegalStateException && 
                throwable.getMessage() != null && 
                throwable.getMessage().contains("Either grant() or deny() has been already called")) {
                Log.w("MainActivity", "Handled redundant WebView permission callback: " + throwable.getMessage());
                return; // Gracefully suppress redundant permission exception without crashing
            }
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });
    }
}
