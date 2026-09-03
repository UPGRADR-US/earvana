import UIKit
import Capacitor
import CapApp_SPM
import StoreKit

/// Registers the custom EarvanaAudio AVAudioEngine plugin with the Capacitor bridge.
/// Without this, iOS would not expose native playback and the web layer could not
/// reach the AVAudioEngine graph (EQ / notch / boost / crossfade loops).
class MyViewController: CAPBridgeViewController {
    private static let reviewLaunchKey = "storeReview.launchCount"
    private static let reviewVersionKey = "storeReview.lastRequestedVersion"
    private var didScheduleReview = false

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(EarvanaAudioPlugin())
        bridge?.registerPluginInstance(StoreReviewPlugin())
        bridge?.registerPluginInstance(EarphoriaBillingPlugin())
        // Fetch StoreKit group 22273852 / product Earvana at launch (Guideline 2.1(b)).
        Task { await SubscriptionManager.shared.start() }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let defaults = UserDefaults.standard
        defaults.set(defaults.integer(forKey: Self.reviewLaunchKey) + 1, forKey: Self.reviewLaunchKey)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        requestStoreReviewIfAppropriate()
    }

    /// After 3 launches, once per marketing version. Apple may still suppress the dialog.
    private func requestStoreReviewIfAppropriate() {
        let defaults = UserDefaults.standard
        let launches = defaults.integer(forKey: Self.reviewLaunchKey)
        let currentVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let lastVersion = defaults.string(forKey: Self.reviewVersionKey)
        guard !didScheduleReview, launches >= 3, lastVersion != currentVersion else { return }
        didScheduleReview = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            guard let view = self?.view, let scene = view.window?.windowScene else { return }
            SKStoreReviewController.requestReview(in: scene)
            UserDefaults.standard.set(currentVersion, forKey: Self.reviewVersionKey)
        }
    }

    // MARK: - Portrait-only lock

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return .portrait
    }

    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
        return .portrait
    }

    override var shouldAutorotate: Bool {
        // Allow rotation machinery only so the system can snap back to portrait if needed.
        return true
    }
}
