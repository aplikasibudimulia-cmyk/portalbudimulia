package com.ebudimulia.portal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
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

        // Initialize Android Notification Channel for Presensi & Announcements
        createNotificationChannel();
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

