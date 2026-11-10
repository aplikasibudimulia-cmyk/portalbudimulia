package com.ebudimulia.portal;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CbtLockTask")
public class CbtLockTaskPlugin extends Plugin {

    private static final String TAG = "CbtLockTaskPlugin";
    private static CbtLockTaskPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void notifyLockState(boolean isLocked) {
        if (instance != null) {
            try {
                JSObject eventData = new JSObject();
                eventData.put("locked", isLocked);
                instance.notifyListeners("cbtLockStateChange", eventData);
            } catch (Exception e) {
                Log.w(TAG, "notifyLockState error: " + e.getMessage());
            }
        }
    }

    @PluginMethod
    public void startLock(PluginCall call) {
        try {
            if (getActivity() == null) {
                call.reject("Activity tidak tersedia");
                return;
            }

            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).startAndVerifyCbtLock(call);
            } else {
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().startLockTask();
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                        notifyLockState(true);
                    } catch (Exception e) {
                        call.reject("Gagal mengaktifkan kunci layar: " + e.getMessage());
                    }
                });
            }
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopLock(PluginCall call) {
        try {
            if (getActivity() == null) {
                call.reject("Activity tidak tersedia");
                return;
            }

            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).enableCbtLock(false);
            } else {
                getActivity().runOnUiThread(() -> {
                    try {
                        getActivity().stopLockTask();
                    } catch (Exception e) {
                        Log.w(TAG, "Fallback stopLockTask: " + e.getMessage());
                    }
                });
            }

            Log.i(TAG, "Android Lock Task Mode berhasil dinonaktifkan.");
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);

            JSObject eventData = new JSObject();
            eventData.put("locked", false);
            notifyListeners("cbtLockStateChange", eventData);
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isLocked(PluginCall call) {
        try {
            ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            boolean nativeLocked = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && am != null) {
                nativeLocked = (am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE);
            }
            boolean locked = nativeLocked;
            JSObject ret = new JSObject();
            ret.put("locked", locked);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isPinProtected(PluginCall call) {
        try {
            int lockToApp = android.provider.Settings.Secure.getInt(
                getContext().getContentResolver(),
                "lock_to_app_exit_locked",
                0
            );
            JSObject ret = new JSObject();
            ret.put("pinProtected", lockToApp != 0);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("pinProtected", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void isDeviceOwner(PluginCall call) {
        try {
            android.app.admin.DevicePolicyManager dpm = 
                (android.app.admin.DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
            boolean isOwner = dpm != null && dpm.isDeviceOwnerApp(getContext().getPackageName());
            JSObject ret = new JSObject();
            ret.put("isDeviceOwner", isOwner);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("isDeviceOwner", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS
            );
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal membuka pengaturan: " + e.getMessage());
        }
    }
}
