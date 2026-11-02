package com.ebudimulia.portal;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    public static volatile boolean isCbtLockActive = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Lock Task Watchdog & Debounce Control
    private Runnable lockWatchdog;
    private long lastPinCallMs = 0;
    private static final long PIN_DEBOUNCE_MS = 2500;
    private long continuousUnpinStartMs = 0;
    private static final long UNPIN_VIOLATION_THRESHOLD_MS = 4000;

    // Android 13+ Predictive Back Interceptor (Mencegah gesture swipe back di Samsung / One UI)
    private android.window.OnBackInvokedCallback cbtBackCallback;
    private boolean isBackCallbackRegistered = false;

    private void registerBackCallback() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (cbtBackCallback == null) {
                cbtBackCallback = () -> {
                    Log.d(TAG, "OnBackInvokedCallback: Gesture swipe/tombol back diblokir karena CBT Lock aktif.");
                };
            }
            if (!isBackCallbackRegistered) {
                try {
                    getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                        android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                        cbtBackCallback
                    );
                    isBackCallbackRegistered = true;
                    Log.d(TAG, "OnBackInvokedCallback berhasil didaftarkan untuk proteksi gesture Samsung.");
                } catch (Exception e) {
                    Log.w(TAG, "registerOnBackInvokedCallback error: " + e.getMessage());
                }
            }
        }
    }

    private void unregisterBackCallback() {
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

    public void enableCbtLock(boolean enable) {
        isCbtLockActive = enable;
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

                    try {
                        startLockTask();
                    } catch (Exception e) {
                        Log.w(TAG, "startLockTask warning: " + e.getMessage());
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

            // Pasang listener instan: jika bar navigasi sempat muncul akibat swipe, langsung sembunyikan kembali dalam 0ms
            decorView.setOnSystemUiVisibilityChangeListener(visibility -> {
                if (isCbtLockActive && (visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0) {
                    mainHandler.post(this::applyImmersiveSticky);
                }
            });

            decorView.setOnApplyWindowInsetsListener((v, insets) -> {
                if (isCbtLockActive) {
                    mainHandler.post(this::applyImmersiveSticky);
                }
                return insets;
            });
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
            if (!hasFocus) {
                Log.w(TAG, "CBT Lock: Window kehilangan fokus (mungkin ada floating app / overlay / status bar)!");
                mainHandler.postDelayed(() -> {
                    if (isCbtLockActive && !hasWindowFocus()) {
                        bringToFront();
                        if (getBridge() != null && getBridge().getWebView() != null) {
                            getBridge().getWebView().evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('cbt_focus_lost', { detail: { reason: 'Fokus layar teralihkan ke aplikasi melayang / overlay' } }));", null
                            );
                        }
                    }
                }, 800);
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
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (isCbtLockActive) {
            applyImmersiveSticky();
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
        if (now - lastPinCallMs < PIN_DEBOUNCE_MS) return;

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
            Log.i(TAG, "safeStartLockTask: Layar berhasil disematkan.");
        } catch (Exception e) {
            Log.w(TAG, "safeStartLockTask: " + e.getMessage());
        }
    }

    /**
     * Watchdog timer yang memantau status sematan layar saat CBT Lock aktif.
     * Jika sematan terlepas (unpin), tunggu konfirmasi beberapa saat sebelum kirim event ke JS
     * agar tidak terjadi false-positive saat transisi awal layar atau saat buka blokir.
     */
    private void startLockWatchdog() {
        stopLockWatchdog();
        lockWatchdog = new Runnable() {
            @Override
            public void run() {
                if (!isCbtLockActive || lockWatchdog == null) return;
                try {
                    applyImmersiveSticky();

                    ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && am != null) {
                        int lockState = am.getLockTaskModeState();
                        if (lockState == ActivityManager.LOCK_TASK_MODE_NONE) {
                            if (continuousUnpinStartMs == 0) {
                                continuousUnpinStartMs = System.currentTimeMillis();
                            } else if (System.currentTimeMillis() - continuousUnpinStartMs >= 2000) {
                                Log.w(TAG, "Watchdog: Sematan terlepas (unpin) > 2s! Mengirim event ke JS untuk mengunci ujian.");
                                continuousUnpinStartMs = 0; // Reset agar tidak mengirim event terus menerus setiap 500ms
                                CbtLockTaskPlugin.notifyLockState(false);
                                if (getBridge() != null && getBridge().getWebView() != null) {
                                    getBridge().getWebView().evaluateJavascript(
                                        "window.dispatchEvent(new CustomEvent('cbt_unpin_attempt'));", null
                                    );
                                }
                            }
                        } else {
                            continuousUnpinStartMs = 0;
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "lockWatchdog error: " + e.getMessage());
                }
                if (isCbtLockActive && lockWatchdog != null) {
                    mainHandler.postDelayed(this, 500);
                }
            }
        };
        // Beri waktu 3 detik agar sistem menyelesaikan transisi pinning sebelum evaluasi watchdog dimulai
        mainHandler.postDelayed(lockWatchdog, 3000);
        Log.i(TAG, "Lock Watchdog DIJADWALKAN (dimulai dalam 3s setelah transisi sematan siap).");
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

