import UIKit
import Capacitor
import GameController

class CampoBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeGamepadPlugin())
    }

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}

@objc(NativeGamepadPlugin)
class NativeGamepadPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativeGamepadPlugin"
    let jsName = "NativeGamepad"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var observers: [NSObjectProtocol] = []
    private var controllers: [ObjectIdentifier: GCController] = [:]
    private var controllerIndices: [ObjectIdentifier: Int] = [:]
    private var nextControllerIndex = 0

    @objc func start(_ call: CAPPluginCall) {
        observeControllers()
        GCController.startWirelessControllerDiscovery {}
        for controller in GCController.controllers() { attach(controller) }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers.removeAll()
        for controller in controllers.values {
            controller.extendedGamepad?.valueChangedHandler = nil
        }
        controllers.removeAll()
        GCController.stopWirelessControllerDiscovery()
        call.resolve()
    }

    private func observeControllers() {
        guard observers.isEmpty else { return }
        observers.append(NotificationCenter.default.addObserver(
            forName: .GCControllerDidConnect, object: nil, queue: .main
        ) { [weak self] notification in
            if let controller = notification.object as? GCController { self?.attach(controller) }
        })
        observers.append(NotificationCenter.default.addObserver(
            forName: .GCControllerDidDisconnect, object: nil, queue: .main
        ) { [weak self] notification in
            if let controller = notification.object as? GCController { self?.detach(controller) }
        })
    }

    private func attach(_ controller: GCController) {
        guard let pad = controller.extendedGamepad else { return }
        let key = ObjectIdentifier(controller)
        controllers[key] = controller
        if controllerIndices[key] == nil {
            controllerIndices[key] = nextControllerIndex
            nextControllerIndex += 1
        }
        pad.valueChangedHandler = { [weak self, weak controller] _, _ in
            guard let self, let controller else { return }
            DispatchQueue.main.async { self.publish(controller, connected: true) }
        }
        publish(controller, connected: true)
    }

    private func detach(_ controller: GCController) {
        let key = ObjectIdentifier(controller)
        guard controllers.removeValue(forKey: key) != nil,
              let index = controllerIndices.removeValue(forKey: key) else { return }
        publish(controller, connected: false, index: index)
    }

    private func publish(_ controller: GCController, connected: Bool, index: Int? = nil) {
        guard let pad = controller.extendedGamepad else { return }
        let buttons: [Double] = [
            Double(pad.buttonA.value), Double(pad.buttonB.value),
            Double(pad.buttonX.value), Double(pad.buttonY.value),
            Double(pad.leftShoulder.value), Double(pad.rightShoulder.value),
            Double(pad.leftTrigger.value), Double(pad.rightTrigger.value),
            Double(pad.buttonOptions?.value ?? 0), Double(pad.buttonMenu.value),
            Double(pad.leftThumbstickButton?.value ?? 0), Double(pad.rightThumbstickButton?.value ?? 0),
            Double(max(0, pad.dpad.yAxis.value)), Double(max(0, -pad.dpad.yAxis.value)),
            Double(max(0, -pad.dpad.xAxis.value)), Double(max(0, pad.dpad.xAxis.value)),
            0
        ]
        let axes: [Double] = [
            Double(pad.leftThumbstick.xAxis.value), Double(-pad.leftThumbstick.yAxis.value),
            Double(pad.rightThumbstick.xAxis.value), Double(-pad.rightThumbstick.yAxis.value)
        ]
        notifyListeners("gamepadChange", data: [
            "index": index ?? controllerIndices[ObjectIdentifier(controller)] ?? 0,
            "name": controller.vendorName ?? "Controller",
            "connected": connected,
            "axes": axes,
            "buttons": buttons
        ])
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
