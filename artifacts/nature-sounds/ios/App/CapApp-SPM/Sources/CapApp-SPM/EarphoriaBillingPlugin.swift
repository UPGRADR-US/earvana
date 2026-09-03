import Capacitor
import StoreKit
import SwiftUI
import UIKit

/// Capacitor bridge for StoreKit 2 (product `Earvana` / group 22273852).
///
/// Methods: initialize, getProductDetails, purchase, presentPaywall, restore, getSubscriptionStatus
/// Events:  billingReady, productDetails, purchaseSuccess, subscriptionStatus, billingError
@objc(EarphoriaBillingPlugin)
public class EarphoriaBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EarphoriaBillingPlugin"
    public let jsName = "EarphoriaBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProductDetails", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentPaywall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSubscriptionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "debugSetSubscribed", returnType: CAPPluginReturnPromise),
    ]

    private var paywallCall: CAPPluginCall?
    private var paywallHost: UIViewController?

    public override func load() {
        Task { @MainActor in
            SubscriptionManager.shared.onStatusChange = { [weak self] isSubscribed in
                self?.emitStatus(
                    isSubscribed,
                    productAvailable: SubscriptionManager.shared.catalogAvailable
                )
            }
            await SubscriptionManager.shared.start()
            self.notifyListeners("billingReady", data: [
                "productId": SubscriptionManager.productID,
                "isSubscribed": SubscriptionManager.shared.isSubscribed,
            ])
            if let product = SubscriptionManager.shared.monthlyProduct {
                self.notifyListeners("productDetails", data: Self.productDict(product))
            }
            self.emitStatus(
                SubscriptionManager.shared.isSubscribed,
                productAvailable: SubscriptionManager.shared.catalogAvailable
            )
        }
    }

    @objc func initialize(_ call: CAPPluginCall) {
        Task { @MainActor in
            await SubscriptionManager.shared.start()
            let mgr = SubscriptionManager.shared
            call.resolve([
                "productId": SubscriptionManager.productID,
                "basePlanId": "monthly",
                "isSubscribed": mgr.isSubscribed,
                "productAvailable": mgr.monthlyProduct != nil,
                "debugUnlockAvailable": SubscriptionManager.debugUnlockAvailable,
            ])
        }
    }

    @objc func getProductDetails(_ call: CAPPluginCall) {
        Task { @MainActor in
            await SubscriptionManager.shared.loadProducts(retries: 3)
            guard let product = SubscriptionManager.shared.monthlyProduct else {
                let data: [String: Any] = [
                    "available": false,
                    "productId": SubscriptionManager.productID,
                ]
                self.notifyListeners("productDetails", data: data)
                call.resolve(data)
                return
            }
            var data = Self.productDict(product)
            data["available"] = true
            self.notifyListeners("productDetails", data: data)
            call.resolve(data)
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        presentPaywall(call)
    }

    @objc func presentPaywall(_ call: CAPPluginCall) {
        Task { @MainActor in
            if SubscriptionManager.shared.isSubscribed || !SubscriptionManager.shared.catalogAvailable {
                call.resolve([
                    "presented": false,
                    "isSubscribed": true,
                    "productAvailable": SubscriptionManager.shared.catalogAvailable,
                ])
                return
            }
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller")
                return
            }
            if presenter.presentedViewController != nil || self.paywallCall != nil {
                call.resolve([
                    "presented": true,
                    "isSubscribed": SubscriptionManager.shared.isSubscribed,
                ])
                return
            }

            self.paywallCall = call
            let root = PremiumPaywallContainer(
                onClose: { [weak self] in
                    self?.finishPaywall(purchased: false)
                },
                onPurchased: { [weak self] in
                    self?.finishPaywall(purchased: true)
                }
            )
            let host = PaywallHostController(rootView: root)
            host.onDismissed = { [weak self] in
                self?.finishPaywall(purchased: false)
            }
            host.modalPresentationStyle = .pageSheet
            if let sheet = host.sheetPresentationController {
                if #available(iOS 16.0, *) {
                    sheet.detents = [.large()]
                }
                sheet.prefersGrabberVisible = true
            }
            self.paywallHost = host
            presenter.present(host, animated: true)
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            await SubscriptionManager.shared.restore()
            let subscribed = SubscriptionManager.shared.isSubscribed
            self.emitStatus(subscribed, productAvailable: SubscriptionManager.shared.catalogAvailable)
            call.resolve(Self.statusDict(subscribed, productAvailable: SubscriptionManager.shared.catalogAvailable))
        }
    }

    @objc func debugSetSubscribed(_ call: CAPPluginCall) {
        #if DEBUG
        let active = call.getBool("subscribed") ?? true
        Task { @MainActor in
            SubscriptionManager.shared.setDebugSubscribed(active)
            self.emitStatus(active, productAvailable: SubscriptionManager.shared.catalogAvailable)
            call.resolve(Self.statusDict(active, productAvailable: SubscriptionManager.shared.catalogAvailable))
        }
        #else
        call.reject("Debug unlock is only available in Debug builds")
        #endif
    }

    @objc func getSubscriptionStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            await SubscriptionManager.shared.refreshEntitlements()
            let subscribed = SubscriptionManager.shared.isSubscribed
            self.emitStatus(subscribed, productAvailable: SubscriptionManager.shared.catalogAvailable)
            call.resolve(Self.statusDict(subscribed, productAvailable: SubscriptionManager.shared.catalogAvailable))
        }
    }

    // MARK: - Helpers

    private func finishPaywall(purchased: Bool) {
        Task { @MainActor in
            let subscribed = purchased || SubscriptionManager.shared.isSubscribed
            if subscribed {
                self.notifyListeners("purchaseSuccess", data: [
                    "isSubscribed": true,
                    "productId": SubscriptionManager.productID,
                ])
            }
            self.emitStatus(subscribed, productAvailable: SubscriptionManager.shared.catalogAvailable)
            let call = self.paywallCall
            self.paywallCall = nil
            let host = self.paywallHost
            self.paywallHost = nil
            let resolve: () -> Void = {
                call?.resolve(["presented": true, "isSubscribed": subscribed])
            }
            if let host = host, host.presentingViewController != nil {
                host.dismiss(animated: true, completion: resolve)
            } else {
                resolve()
            }
        }
    }

    private func emitStatus(_ isSubscribed: Bool, productAvailable: Bool) {
        notifyListeners("subscriptionStatus", data: Self.statusDict(isSubscribed, productAvailable: productAvailable))
    }

    private static func statusDict(_ isSubscribed: Bool, productAvailable: Bool) -> [String: Any] {
        [
            "isSubscribed": isSubscribed,
            "productId": SubscriptionManager.productID,
            "basePlanId": "monthly",
            "productAvailable": productAvailable,
        ]
    }

    private static func productDict(_ product: Product) -> [String: Any] {
        var period = "P1M"
        if let sub = product.subscription {
            switch sub.subscriptionPeriod.unit {
            case .day: period = "P\(sub.subscriptionPeriod.value)D"
            case .week: period = "P\(sub.subscriptionPeriod.value)W"
            case .month: period = "P\(sub.subscriptionPeriod.value)M"
            case .year: period = "P\(sub.subscriptionPeriod.value)Y"
            @unknown default: period = "P1M"
            }
        }
        return [
            "productId": product.id,
            "title": product.displayName,
            "description": product.description,
            "formattedPrice": product.displayPrice,
            "billingPeriod": period,
            "basePlanId": "monthly",
        ]
    }
}

private final class PaywallHostController: UIHostingController<PremiumPaywallContainer>, UIAdaptivePresentationControllerDelegate {
    var onDismissed: (() -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        presentationController?.delegate = self
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil {
            onDismissed?()
        }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        onDismissed?()
    }
}
