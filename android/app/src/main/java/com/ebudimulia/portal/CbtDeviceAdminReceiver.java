package com.ebudimulia.portal;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.Toast;

/**
 * Receiver Device Administrator untuk Mode Kiosk Penuh (True Lock Task Mode).
 * Memungkinkan penguncian perangkat 100% mutlak saat ujian tanpa bisa dilepas oleh 2 tombol navigasi.
 */
public class CbtDeviceAdminReceiver extends DeviceAdminReceiver {
    private static final String TAG = "CbtDeviceAdmin";

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Log.i(TAG, "CBT Device Admin AKTIF pada perangkat.");
        Toast.makeText(context, "eBudiMulia CBT Kiosk Mode diaktifkan.", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Log.i(TAG, "CBT Device Admin DINONAKTIFKAN.");
    }

    @Override
    public void onLockTaskModeEntering(Context context, Intent intent, String pkg) {
        super.onLockTaskModeEntering(context, intent, pkg);
        Log.i(TAG, "Memasuki True Lock Task Mode untuk paket: " + pkg);
    }

    @Override
    public void onLockTaskModeExiting(Context context, Intent intent) {
        super.onLockTaskModeExiting(context, intent);
        Log.i(TAG, "Keluar dari True Lock Task Mode.");
    }
}
