import Capacitor
import StoreKit
import UIKit

/// In-app App Store review prompt (StoreKit). Apple may ignore the request
/// based on quota — this is not guaranteed to present a dialog.
public enum StoreReview {
    public static func request(in view: UIView?) {
        guard let scene = view?.window?.windowScene else { return }
        SKStoreReviewController.requestReview(in: scene)
    }
}

@objc(StoreReviewPlugin)
public class StoreReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreReviewPlugin"
    public let jsName = "StoreReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let view = self.bridge?.viewController?.view
            StoreReview.request(in: view)
            call.resolve(["presented": view?.window?.windowScene != nil])
        }
    }
}
