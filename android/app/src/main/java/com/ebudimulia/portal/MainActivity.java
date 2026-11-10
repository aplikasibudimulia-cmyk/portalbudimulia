package com.ebudimulia.portal;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    public static volatile boolean isCbtLockActive = false;
    private volatile boolean hasConfirmedPinning = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Lock Task Watchdog & Debounce Control
    private Runnable lockWatchdog;
    private Runnable verifyPinRunnable;
    private long lastPinCallMs = 0;
    private static final long PIN_DEBOUNCE_MS = 1500;
    private long continuousUnpinStartMs = 0;

    // Android 13+ Predictive Back & AndroidX Back Dispatcher Interceptor (Mencegah gesture swipe back 100%)
    private android.window.OnBackInvokedCallback cbtBackCallback;
    private boolean isBackCallbackRegistered = false;
    private androidx.activity.OnBackPressedCallback cbtAndroidXBackCallback;

    private void registerBackCallback() {
        // 1. Blokir di level AndroidX OnBackPressedDispatcher (mengalahkan AppPlugin Capacitor)
        try {
            if (cbtAndroidXBackCallback != null) {
                cbtAndroidXBackCallback.remove();
            }
            cbtAndroidXBackCallback = new androidx.activity.OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    Log.d(TAG, "AndroidX OnBackPressedCallback: Tombol/gesture Back diblokir total oleh CBT Lock.");
                }
            };
            getOnBackPressedDispatcher().addCallback(this, cbtAndroidXBackCallback);
        } catch (Exception e) {
            Log.w(TAG, "register AndroidX OnBackPressedCallback error: " + e.getMessage());
        }

        // 2. Blokir di level Android 13+ OnBackInvokedDispatcher
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (cbtBackCallback == null) {
                cbtBackCallback = () -> {
                    Log.d(TAG, "OnBackInvokedCallback: Gesture swipe/tombol back diblokir karena CBT Lock aktif.");
                };
            }
            if (!isBackCallbackRegistered) {
                try {
                    getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                        1000000, // Prioritas tertinggi di atas callback default
                        cbtBackCallback
                    );
                    isBackCallbackRegistered = true;
                } catch (Exception e) {
                    try {
                        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                            cbtBackCallback
                        );
                        isBackCallbackRegistered = true;
                    } catch (Exception ex) {
                        Log.w(TAG, "registerOnBackInvokedCallback error: " + ex.getMessage());
                    }
                }
            }
        }
    }

    private void unregisterBackCallback() {
        try {
            if (cbtAndroidXBackCallback != null) {
                cbtAndroidXBackCallback.setEnabled(false);
                cbtAndroidXBackCallback.remove();
                cbtAndroidXBackCallback = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "unregister AndroidX OnBackPressedCallback error: " + e.getMessage());
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && isBackCallbackRegistered && cbtBackCallback != null) {
            try {
                getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(cbtBackCallback);
                isBackCallbackRegistered = false;
                Log.d(TAG, "OnBackInvokedCallback berhasil dilepas.");
            } catch (Exception e) {
                Log.w(TAG, "unregisterOnBackInvokedCallback error: " + e.getMessage());
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CbtLockTaskPlugin.class);
        super.onCreate(savedInstanceState);

        // Safeguard against Chromium/Capacitor redundant permission callback crash
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            if (throwable instanceof IllegalStateException && 
                throwable.getMessage() != null && 
                throwable.getMessage().contains("Either grant() or deny() has been already called")) {
                Log.w(TAG, "Handled redundant WebView permission callback: " + throwable.getMessage());
                return; // Gracefully suppress redundant permission exception without crashing
            }
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });

        // Initialize Android Notification Channel for Presensi & Announcements
        createNotificationChannel();
    }

    public boolean isNativeLockTaskActive() {
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && am != null) {
                return am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
            }
        } catch (Exception e) {
            Log.w(TAG, "isNativeLockTaskActive error: " + e.getMessage());
        }
        return false;
    }

    /**
     * Memulai Lock Task Mode dan memverifikasi bahwa pengguna benar-benar menekan
     * "Oke / Sematkan / Mengerti" pada dialog sistem Android (setara dengan iOS AAC).
     * Jika pengguna menekan "Tidak / Batal", maka call.reject() dipanggil sehingga soal TIDAK terbuka.
     */
    private final List<PluginCall> pendingLockCalls = new ArrayList<>();

    public void startAndVerifyCbtLock(final PluginCall call) {
        mainHandler.post(() -> {
            // 1. Jika sudah dalam status tersemat (PINNED / LOCKED), langsung resolve
            if (isNativeLockTaskActive()) {
                isCbtLockActive = true;
                hasConfirmedPinning = true;
                enableCbtLock(true);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("alreadyActive", true);
                ret.put("locked", true);
                call.resolve(ret);
                CbtLockTaskPlugin.notifyLockState(true);
                return;
            }

            pendingLockCalls.add(call);
            if (verifyPinRunnable != null) {
                // Sudah ada verifikasi dialog sematan yang sedang berjalan, jangan panggil ulang startLockTask()
                return;
            }

            hasConfirmedPinning = false;
            enableCbtLock(true);

            final long startWaitMs = System.currentTimeMillis();
            final boolean[] sawSystemDialog = { false };
            final long[] dialogClosedAtMs = { 0L };

            verifyPinRunnable = new Runnable() {
                @Override
                public void run() {
                    if (isNativeLockTaskActive()) {
                        verifyPinRunnable = null;
                        hasConfirmedPinning = true;
                        startLockWatchdog();
                        Log.i(TAG, "Verifikasi Sematan Layar Android BERHASIL (LOCK_TASK_MODE aktif).");
                        List<PluginCall> toResolve = new ArrayList<>(pendingLockCalls);
                        pendingLockCalls.clear();
                        for (PluginCall c : toResolve) {
                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            ret.put("locked", true);
                            try { c.resolve(ret); } catch (Exception ignored) {}
                        }
                        CbtLockTaskPlugin.notifyLockState(true);
                        return;
                    }

                    long elapsed = System.currentTimeMillis() - startWaitMs;
                    boolean focused = hasWindowFocus();

                    if (!focused) {
                        // Dialog sistem "Sematkan aplikasi ini?" sedang tampil di atas aplikasi
                        sawSystemDialog[0] = true;
                        dialogClosedAtMs[0] = 0L;
                    } else if (sawSystemDialog[0]) {
                        // Fokus kembali ke aplikasi setelah dialog sistem tertutup, namun belum tersemat
                        if (dialogClosedAtMs[0] == 0L) {
                            dialogClosedAtMs[0] = System.currentTimeMillis();
                        } else if (System.currentTimeMillis() - dialogClosedAtMs[0] >= 450) {
                            // Pengguna menekan "Tidak / Batal" pada dialog sematkan layar!
                            verifyPinRunnable = null;
                            CbtLockTaskPlugin.notifyLockState(false);
                            List<PluginCall> toReject = new ArrayList<>(pendingLockCalls);
                            pendingLockCalls.clear();
                            for (PluginCall c : toReject) {
                                try {
                                    c.reject("Izin Sematan Layar ditolak. Anda WAJIB menekan tombol 'Oke / Sematkan / Mengerti' pada jendela konfirmasi Android untuk membuka soal ujian.");
                                } catch (Exception ignored) {}
                            }
                            return;
                        }
                    }

                    // Jika setelah 3.5 detik dialog sistem sama sekali tidak muncul dan layar belum tersemat
                    // (misal fitur Sematkan Aplikasi dimatikan di Pengaturan HP), atau batas tunggu 15 detik habis
                    if ((!sawSystemDialog[0] && elapsed >= 3500) || elapsed >= 15000) {
                        verifyPinRunnable = null;
                        CbtLockTaskPlugin.notifyLockState(false);
                        List<PluginCall> toReject = new ArrayList<>(pendingLockCalls);
                        pendingLockCalls.clear();
                        for (PluginCall c : toReject) {
                            try {
                                c.reject("Layar belum berhasil disematkan. Pastikan Anda menekan 'Oke / Sematkan' pada pop-up Android (atau aktifkan fitur 'Sematkan Aplikasi / Pin App' di Pengaturan Keamanan HP Anda).");
                            } catch (Exception ignored) {}
                        }
                        return;
                    }

                    mainHandler.postDelayed(this, 150);
                }
            };

            mainHandler.postDelayed(verifyPinRunnable, 200);
        });
    }

    public void enableCbtLock(boolean enable) {
        isCbtLockActive = enable;
        if (!enable) {
            hasConfirmedPinning = false;
            if (verifyPinRunnable != null) {
                mainHandler.removeCallbacks(verifyPinRunnable);
                verifyPinRunnable = null;
            }
            pendingLockCalls.clear();
        }
        mainHandler.post(() -> {
            try {
                if (enable) {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().setBackgroundColor(0xFFF8FAFC);
                    }
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                        setShowWhenLocked(true);
                        setTurnScreenOn(true);
                    } else {
                        getWindow().addFlags(
                            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        );
                    }
                    applyImmersiveSticky();

                    // Konfigurasi True Device Owner Kiosk Mode (jika di-set sebagai Device Owner)
                    try {
                        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
                        ComponentName adminComponent = new ComponentName(this, CbtDeviceAdminReceiver.class);
                        if (dpm != null && dpm.isDeviceOwnerApp(getPackageName())) {
                            dpm.setLockTaskPackages(adminComponent, new String[]{getPackageName()});
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
                            }
                            Log.i(TAG, "True Device Owner Kiosk Mode AKTIF: Semua tombol unpin & navigasi dimatikan.");
                        }
                    } catch (Exception dpmErr) {
                        Log.w(TAG, "DPM setup warning: " + dpmErr.getMessage());
                    }

                    if (!isNativeLockTaskActive()) {
                        lastPinCallMs = System.currentTimeMillis();
                        try {
                            startLockTask();
                        } catch (Exception e) {
                            Log.w(TAG, "startLockTask warning: " + e.getMessage());
                        }
                    } else {
                        hasConfirmedPinning = true;
                    }
                    startLockWatchdog();
                    registerBackCallback();
                    Log.i(TAG, "CBT Lock Screen AKTIF dengan proteksi maksimal.");
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                        setShowWhenLocked(false);
                        setTurnScreenOn(false);
                    } else {
                        getWindow().clearFlags(
                            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        );
                    }
                    exitImmersiveSticky();
                    stopLockWatchdog();
                    unregisterBackCallback();
                    try {
                        stopLockTask();
                    } catch (Exception e) {
                        Log.w(TAG, "stopLockTask warning: " + e.getMessage());
                    }
                    Log.i(TAG, "CBT Lock Screen DINONAKTIFKAN.");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error toggling CBT Lock: " + e.getMessage(), e);
            }
        });
    }

    private void applyImmersiveSticky() {
        if (!isCbtLockActive) return;
        try {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            }

            // Tetap pasang kombinasi legacy flag untuk kompatibilitas penuh perangkat Samsung Galaxy Tab / One UI
            View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );

            // Blokir gesture swipe dari tepi kiri, kanan, atas, dan bawah layar pada Android 10+ (API 29+)
            // Catatan Android OS: kuota vertikal per tepi kiri/kanan dibatasi 200dp oleh WindowManager.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    DisplayMetrics dm = getResources().getDisplayMetrics();
                    int w = dm.widthPixels > 0 ? dm.widthPixels : 1440;
                    int h = dm.heightPixels > 0 ? dm.heightPixels : 3200;
                    int quota200dp = (int) (200f * (dm.density > 0 ? dm.density : 3f));
                    int bottomEdgeTop = Math.max(0, h - quota200dp);
                    List<Rect> exclusions = new ArrayList<>();
                    exclusions.add(new Rect(0, 0, w, 140));                   // Tepi atas (status bar pull-down)
                    exclusions.add(new Rect(0, h - 200, w, h));               // Tepi bawah penuh (gesture bar bawah)
                    exclusions.add(new Rect(0, bottomEdgeTop, 160, h));       // Tepi kiri area jempol (200dp)
                    exclusions.add(new Rect(w - 160, bottomEdgeTop, w, h));   // Tepi kanan area jempol (200dp)
                    decorView.setSystemGestureExclusionRects(exclusions);
                } catch (Exception ignored) {}
            }

            // Pasang listener instan: hanya sembunyikan kembali jika system bar benar-benar terlihat (mencegah relayout loop)
            decorView.setOnSystemUiVisibilityChangeListener(visibility -> {
                if (isCbtLockActive && (visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0) {
                    mainHandler.post(this::applyImmersiveSticky);
                }
            });

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                decorView.setOnApplyWindowInsetsListener((v, insets) -> {
                    if (isCbtLockActive && insets.isVisible(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars())) {
                        WindowInsetsController ctrl = getWindow().getInsetsController();
                        if (ctrl != null) {
                            ctrl.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                        }
                    }
                    return insets;
                });
            }
        } catch (Exception e) {
            Log.w(TAG, "applyImmersiveSticky error: " + e.getMessage());
        }
    }

    private void exitImmersiveSticky() {
        try {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(true);
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                }
            }
            View decorView = getWindow().getDecorView();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    decorView.setSystemGestureExclusionRects(new ArrayList<>());
                } catch (Exception ignored) {}
            }
            decorView.setOnSystemUiVisibilityChangeListener(null);
            decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        } catch (Exception e) {
            Log.w(TAG, "exitImmersiveSticky error: " + e.getMessage());
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (isCbtLockActive) {
            applyImmersiveSticky();
            if (!hasFocus && hasConfirmedPinning) {
                Log.w(TAG, "CBT Lock: Window kehilangan fokus saat terkunci!");
                try {
                    sendBroadcast(new Intent(Intent.ACTION_CLOSE_SYSTEM_DIALOGS));
                } catch (Exception ignored) {}
                mainHandler.postDelayed(() -> {
                    if (isCbtLockActive && hasConfirmedPinning && !hasWindowFocus()) {
                        bringToFront();
                        if (getBridge() != null && getBridge().getWebView() != null) {
                            getBridge().getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('cbt_focus_lost', { detail: { reason: 'Fokus layar teralihkan ke aplikasi melayang / overlay' } }));", null
                            );
                        }
                    }
                }, 600);
            }
        }
    }

    @Override
    public void onMultiWindowModeChanged(boolean isInMultiWindowMode, android.content.res.Configuration newConfig) {
        super.onMultiWindowModeChanged(isInMultiWindowMode, newConfig);
        if (isCbtLockActive && isInMultiWindowMode) {
            Log.w(TAG, "CBT Lock: Terdeteksi mode split-screen / multi-window!");
            bringToFront();
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('cbt_focus_lost', { detail: { reason: 'Terdeteksi mode split-screen / multi-window' } }));", null
                );
            }
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (isCbtLockActive) {
            Log.w(TAG, "CBT Lock: Deteksi user mencoba keluar (onUserLeaveHint), re-anchor to front...");
            bringToFront();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        if (isCbtLockActive) {
            Log.w(TAG, "CBT Lock: onPause terpicu saat ujian aktif! Tarik kembali ke depan.");
            bringToFront();
        }
    }

    private void bringToFront() {
        mainHandler.post(() -> {
            if (!isCbtLockActive) return;
            try {
                Intent intent = new Intent(MainActivity.this, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(intent);
                applyImmersiveSticky();
            } catch (Exception e) {
                Log.w(TAG, "bringToFront error: " + e.getMessage());
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        if (isCbtLockActive) {
            applyImmersiveSticky();
            registerBackCallback();
            if (!isNativeLockTaskActive() && verifyPinRunnable == null) {
                safeStartLockTask();
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (isCbtLockActive) {
            applyImmersiveSticky();
            registerBackCallback();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        if (isCbtLockActive) {
            Log.w(TAG, "CBT Lock: onStop saat ujian aktif! Re-anchor.");
            mainHandler.postDelayed(() -> {
                if (!isCbtLockActive) return;
                try {
                    Intent reIntent = new Intent(MainActivity.this, MainActivity.class);
                    reIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(reIntent);
                } catch (Exception e) {
                    Log.w(TAG, "onStop re-anchor error: " + e.getMessage());
                }
            }, 100);
        }
    }

    /**
     * Memanggil startLockTask() dengan debounce untuk mencegah dialog sistem berkedip.
     */
    public void safeStartLockTask() {
        long now = System.currentTimeMillis();
        if (now - lastPinCallMs < 2000) return;

        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && am != null) {
                if (am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) {
                    return; // Sudah disematkan, tidak perlu panggil ulang
                }
            }
        } catch (Exception e) {}

        lastPinCallMs = now;
        try {
            startLockTask();
            Log.i(TAG, "safeStartLockTask: Meminta sematan layar kembali.");
        } catch (Exception e) {
            Log.w(TAG, "safeStartLockTask: " + e.getMessage());
        }
    }

    /**
     * Watchdog timer yang memantau status sematan layar saat CBT Lock aktif (setiap 250ms).
     * Begitu sematan layar terlepas (unpin), langsung sembunyikan soal, kunci ujian,
     * dan paksa dialog penyematan muncul kembali agar siswa tidak bisa keluar dari layar terkunci!
     */
    private void startLockWatchdog() {
        stopLockWatchdog();
        lockWatchdog = new Runnable() {
            @Override
            public void run() {
                if (!isCbtLockActive || lockWatchdog == null) return;
                try {
                    boolean currentlyPinned = isNativeLockTaskActive();
                    if (currentlyPinned) {
                        continuousUnpinStartMs = 0;
                        if (!hasConfirmedPinning) {
                            hasConfirmedPinning = true;
                            CbtLockTaskPlugin.notifyLockState(true);
                        }
                    } else {
                        if (hasConfirmedPinning) {
                            if (continuousUnpinStartMs == 0) {
                                continuousUnpinStartMs = System.currentTimeMillis();
                            } else if (System.currentTimeMillis() - continuousUnpinStartMs >= 250) {
                                Log.w(TAG, "Watchdog: Sematan terlepas (unpin) terdeteksi! Mengunci ujian & memaksa re-pin.");
                                continuousUnpinStartMs = 0;
                                hasConfirmedPinning = false;
                                CbtLockTaskPlugin.notifyLockState(false);
                                if (getBridge() != null && getBridge().getWebView() != null) {
                                    getBridge().getWebView().evaluateJavascript(
                                        "window.dispatchEvent(new CustomEvent('cbt_unpin_attempt'));", null
                                    );
                                }
                                if (hasWindowFocus() && verifyPinRunnable == null) {
                                    safeStartLockTask();
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "lockWatchdog error: " + e.getMessage());
                }
                if (isCbtLockActive && lockWatchdog != null) {
                    mainHandler.postDelayed(this, 250);
                }
            }
        };
        mainHandler.postDelayed(lockWatchdog, 300);
        Log.i(TAG, "Lock Watchdog AKTIF (interval 250ms).");
    }

    private void stopLockWatchdog() {
        Runnable wd = lockWatchdog;
        lockWatchdog = null;
        if (wd != null) {
            mainHandler.removeCallbacks(wd);
        }
        continuousUnpinStartMs = 0;
    }

    @Override
    public void onBackPressed() {
        if (isCbtLockActive) {
            Log.d(TAG, "onBackPressed diabaikan karena CBT Lock aktif.");
            return; // Cegah tombol back
        }
        super.onBackPressed();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isCbtLockActive) {
            if (keyCode == KeyEvent.KEYCODE_BACK || 
                keyCode == KeyEvent.KEYCODE_HOME || 
                keyCode == KeyEvent.KEYCODE_APP_SWITCH) {
                Log.d(TAG, "onKeyDown tombol " + keyCode + " diblokir oleh CBT Lock.");
                return true; // Blokir tombol navigasi
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if (isCbtLockActive) {
            if (keyCode == KeyEvent.KEYCODE_BACK || 
                keyCode == KeyEvent.KEYCODE_HOME || 
                keyCode == KeyEvent.KEYCODE_APP_SWITCH) {
                Log.d(TAG, "onKeyLongPress tombol " + keyCode + " diblokir oleh CBT Lock.");
                return true; // Blokir long-press tombol back/home
            }
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (isCbtLockActive) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_BACK || 
                keyCode == KeyEvent.KEYCODE_HOME ||
                keyCode == KeyEvent.KEYCODE_APP_SWITCH) {
                return true; // Tangkap dan konsumsi sebelum diteruskan
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                // Bersihkan channel lama yang mungkin bermasalah dengan setting sound/importance
                try {
                    manager.deleteNotificationChannel("ebudimulia-notif-v1");
                    manager.deleteNotificationChannel("ebudimulia-notif-v2");
                    manager.deleteNotificationChannel("ebudimulia-notif-v3");
                    manager.deleteNotificationChannel("ebudimulia-notif-v4");
                } catch (Exception ignored) {}

                String channelId = "ebudimulia_presensi_v5";
                NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "eBudiMulia Presensi & Pengumuman",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Notifikasi kehadiran presensi, tabungan, dan pengumuman sekolah");
                channel.enableVibration(true);
                channel.enableLights(true);
                channel.setLightColor(0xFF4F46E5);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .build();
                channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), audioAttributes);

                manager.createNotificationChannel(channel);
                Log.d("MainActivity", "Native notification channel registered: " + channelId);
            }
        }
    }
}

