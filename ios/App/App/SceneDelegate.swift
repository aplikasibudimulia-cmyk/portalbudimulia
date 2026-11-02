import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }

        // Pastikan UIWindow terpasang jika belum diinisialisasi otomatis oleh Storyboard
        if window == nil {
            let storyboard = UIStoryboard(name: "Main", bundle: nil)
            if let rootVC = storyboard.instantiateInitialViewController() {
                let win = UIWindow(windowScene: windowScene)
                win.rootViewController = rootVC
                self.window = win
                win.makeKeyAndVisible()
            }
        }

        // Teruskan lifecycle scene ke Capacitor SceneDelegateProxy
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        // Dipanggil saat scene dilepas oleh sistem
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Dipanggil saat scene menjadi aktif
    }

    func sceneWillResignActive(_ scene: UIScene) {
        // Dipanggil saat scene berpindah dari status aktif ke non-aktif
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        // Dipanggil saat scene berpindah ke foreground
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        // Dipanggil saat scene berpindah ke background
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
