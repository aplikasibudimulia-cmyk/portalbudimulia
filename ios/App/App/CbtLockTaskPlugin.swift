import Foundation
import Capacitor
import AutomaticAssessmentConfiguration

@objc(CbtLockTaskPlugin)
public class CbtLockTaskPlugin: CAPPlugin, CAPBridgedPlugin, AEAssessmentSessionDelegate {
    public let identifier = "CbtLockTaskPlugin"
    public let jsName = "CbtLockTask"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isLocked", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPinProtected", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise)
    ]

    // Static references to guarantee single session lifecycle across reloads
    private static var activeSession: AEAssessmentSession?
    private static var isStarting = false
    private static var isAssessmentActive = false
    private static var shouldCancelPendingStart = false
    private static var pendingStartCalls: [CAPPluginCall] = []
    private static var pendingEndCalls: [CAPPluginCall] = []

    @objc func startLock(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        DispatchQueue.main.async {
            CbtLockTaskPlugin.isAssessmentActive = true
            CbtLockTaskPlugin.shouldCancelPendingStart = false
            call.resolve([
                "success": true,
                "simulator": true,
                "message": "AAC Simulator Mode (Mock)"
            ])
            self.notifyListeners("cbtLockStateChange", data: ["locked": true])
        }
        return
        #else
        if #available(iOS 13.4, *) {
            DispatchQueue.main.async {
                CbtLockTaskPlugin.shouldCancelPendingStart = false

                // 1. Jika sesi sudah aktif, langsung resolve
                if CbtLockTaskPlugin.isAssessmentActive || (CbtLockTaskPlugin.activeSession?.isActive ?? false) {
                    call.resolve([
                        "success": true,
                        "alreadyActive": true
                    ])
                    return
                }

                // 2. Jika sesi sedang dalam proses mulai (alert sistem Apple sedang tampil), simpan panggilan untuk diselesaikan saat pengguna memilih
                if CbtLockTaskPlugin.isStarting {
                    CbtLockTaskPlugin.pendingStartCalls.append(call)
                    return
                }

                CbtLockTaskPlugin.isStarting = true
                CbtLockTaskPlugin.pendingStartCalls.append(call)

                let config = AEAssessmentConfiguration()
                let newSession = AEAssessmentSession(configuration: config)
                newSession.delegate = self
                CbtLockTaskPlugin.activeSession = newSession
                newSession.begin()
            }
        } else {
            call.reject("Automatic Assessment Configuration memerlukan iOS 13.4+")
        }
        #endif
    }

    @objc func stopLock(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        DispatchQueue.main.async {
            CbtLockTaskPlugin.isStarting = false
            CbtLockTaskPlugin.isAssessmentActive = false
            CbtLockTaskPlugin.shouldCancelPendingStart = false
            CbtLockTaskPlugin.activeSession = nil
            call.resolve(["success": true])
            self.notifyListeners("cbtLockStateChange", data: ["locked": false])
        }
        return
        #else
        if #available(iOS 13.4, *) {
            DispatchQueue.main.async {
                // Tandai bahwa pembatalan diminta, batalkan semua panggilan start yang tertunda
                CbtLockTaskPlugin.shouldCancelPendingStart = true
                CbtLockTaskPlugin.isStarting = false

                for startCall in CbtLockTaskPlugin.pendingStartCalls {
                    startCall.reject("Dibatalkan karena keluar dari sesi ujian")
                }
                CbtLockTaskPlugin.pendingStartCalls.removeAll()

                guard let session = CbtLockTaskPlugin.activeSession else {
                    CbtLockTaskPlugin.isAssessmentActive = false
                    call.resolve(["success": true, "message": "No active session"])
                    self.notifyListeners("cbtLockStateChange", data: ["locked": false])
                    return
                }

                CbtLockTaskPlugin.pendingEndCalls.append(call)

                // Selalu panggil end pada session yang tersimpan
                session.end()
            }
        } else {
            call.resolve(["success": true])
        }
        #endif
    }

    @objc func isLocked(_ call: CAPPluginCall) {
        if #available(iOS 13.4, *) {
            let active = (CbtLockTaskPlugin.activeSession?.isActive ?? false) || CbtLockTaskPlugin.isAssessmentActive
            call.resolve(["locked": active])
        } else {
            call.resolve(["locked": false])
        }
    }

    @objc func isPinProtected(_ call: CAPPluginCall) {
        // Pada iOS, AAC dikontrol penuh oleh sistem operasi Apple
        call.resolve([
            "isPinProtected": false,
            "supported": true,
            "platform": "ios"
        ])
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let settingsUrl = URL(string: UIApplication.openSettingsURLString),
               UIApplication.shared.canOpenURL(settingsUrl) {
                UIApplication.shared.open(settingsUrl) { success in
                    call.resolve(["success": success])
                }
            } else {
                call.reject("Tidak dapat membuka pengaturan aplikasi")
            }
        }
    }

    // MARK: - AEAssessmentSessionDelegate
    public func assessmentSessionDidBegin(_ session: AEAssessmentSession) {
        DispatchQueue.main.async {
            CbtLockTaskPlugin.isStarting = false
            CbtLockTaskPlugin.activeSession = session

            // Jika sebelum pengguna memilih "Yes" sistem sudah meminta stopLock (misal siswa keluar ke menu lain)
            if CbtLockTaskPlugin.shouldCancelPendingStart {
                // Beri sedikit jeda runloop agar sistem Apple menyelesaikan transisi begin, lalu segera akhiri
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    session.end()
                }
                return
            }

            CbtLockTaskPlugin.isAssessmentActive = true
            for call in CbtLockTaskPlugin.pendingStartCalls {
                call.resolve(["success": true])
            }
            CbtLockTaskPlugin.pendingStartCalls.removeAll()
            self.notifyListeners("cbtLockStateChange", data: ["locked": true])
        }
    }

    public func assessmentSessionDidEnd(_ session: AEAssessmentSession) {
        DispatchQueue.main.async {
            CbtLockTaskPlugin.isStarting = false
            CbtLockTaskPlugin.isAssessmentActive = false
            CbtLockTaskPlugin.shouldCancelPendingStart = false
            CbtLockTaskPlugin.activeSession = nil
            for call in CbtLockTaskPlugin.pendingEndCalls {
                call.resolve(["success": true])
            }
            CbtLockTaskPlugin.pendingEndCalls.removeAll()
            self.notifyListeners("cbtLockStateChange", data: ["locked": false])
        }
    }

    public func assessmentSession(_ session: AEAssessmentSession, failedToBeginWithError error: Error) {
        DispatchQueue.main.async {
            CbtLockTaskPlugin.isStarting = false
            CbtLockTaskPlugin.isAssessmentActive = false
            CbtLockTaskPlugin.shouldCancelPendingStart = false
            CbtLockTaskPlugin.activeSession = nil
            for call in CbtLockTaskPlugin.pendingStartCalls {
                call.reject("Izin penguncian layar (Confirm App Self-Lock) ditolak atau dibatalkan: \(error.localizedDescription)")
            }
            CbtLockTaskPlugin.pendingStartCalls.removeAll()
            for call in CbtLockTaskPlugin.pendingEndCalls {
                call.resolve(["success": true])
            }
            CbtLockTaskPlugin.pendingEndCalls.removeAll()
            self.notifyListeners("cbtLockStateChange", data: ["locked": false])
        }
    }

    public func assessmentSession(_ session: AEAssessmentSession, wasInterruptedWithError error: Error) {
        DispatchQueue.main.async {
            CbtLockTaskPlugin.isStarting = false
            CbtLockTaskPlugin.isAssessmentActive = false
            CbtLockTaskPlugin.shouldCancelPendingStart = false
            CbtLockTaskPlugin.activeSession = nil
            for call in CbtLockTaskPlugin.pendingEndCalls {
                call.resolve(["success": true])
            }
            CbtLockTaskPlugin.pendingEndCalls.removeAll()
            self.notifyListeners("cbtLockStateChange", data: ["locked": false])
        }
    }
}
