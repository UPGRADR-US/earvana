import UIKit
import Capacitor
import CapApp_SPM

/// Registers the custom EarvanaAudio AVAudioEngine plugin with the Capacitor bridge.
/// Without this, iOS would not expose native playback and the web layer could not
/// reach the AVAudioEngine graph (EQ / notch / boost / crossfade loops).
class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(EarvanaAudioPlugin())
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
