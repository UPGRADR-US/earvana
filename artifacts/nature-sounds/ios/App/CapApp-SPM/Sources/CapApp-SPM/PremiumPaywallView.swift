import SwiftUI
import StoreKit

/// Native StoreKit 2 paywall (Guideline 3.1.2).
/// iOS 17+: `SubscriptionStoreView` for group `22273852` (Premium Earphoria).
/// iOS 15–16: equivalent StoreKit 2 purchase UI.
struct PremiumPaywallContainer: View {
    var onClose: () -> Void
    var onPurchased: () -> Void

    var body: some View {
        Group {
            if #available(iOS 17.0, *) {
                SubscriptionPaywallView(onClose: onClose, onPurchased: onPurchased)
            } else {
                LegacyPaywallView(onClose: onClose, onPurchased: onPurchased)
            }
        }
        .preferredColorScheme(.dark)
        .environmentObject(SubscriptionManager.shared)
    }
}

// MARK: - iOS 17+ SubscriptionStoreView

@available(iOS 17.0, *)
private struct SubscriptionPaywallView: View {
    var onClose: () -> Void
    var onPurchased: () -> Void

    @EnvironmentObject private var manager: SubscriptionManager
    @State private var finished = false

    var body: some View {
        SubscriptionStoreView(groupID: SubscriptionManager.subscriptionGroupID) {
            PaywallMarketingHeader()
        }
        .subscriptionStoreControlStyle(.automatic)
        .subscriptionStoreButtonLabel(.multiline)
        .storeButton(.visible, for: .restorePurchases)
        .subscriptionStorePolicyForegroundStyle(.white.opacity(0.9))
        .subscriptionStorePolicyDestination(url: LegalLinks.privacyPolicy, for: .privacyPolicy)
        .subscriptionStorePolicyDestination(url: LegalLinks.termsOfUse, for: .termsOfService)
        .subscriptionStorePolicyDestination(for: .privacyPolicy) {
            LegalDocumentView(title: "Privacy Policy", text: LegalCopy.privacyPolicy)
        }
        .subscriptionStorePolicyDestination(for: .termsOfService) {
            LegalDocumentView(title: "Terms of Use", text: LegalCopy.termsOfUse)
        }
        .subscriptionStatusTask(for: SubscriptionManager.subscriptionGroupID) { _ in
            await manager.refreshEntitlements()
            if manager.isSubscribed { finishPurchased() }
        }
        .onInAppPurchaseCompletion { _, result in
            await handlePurchase(result)
        }
        .onChange(of: manager.isSubscribed) { _, subscribed in
            if subscribed { finishPurchased() }
        }
        .task {
            await manager.loadProducts(retries: 3)
            await manager.refreshEntitlements()
            if manager.isSubscribed { finishPurchased() }
        }
        .background(PaywallPalette.background.ignoresSafeArea())
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close", action: onClose)
            }
        }
    }

    private func handlePurchase(_ result: Result<Product.PurchaseResult, Error>) async {
        switch result {
        case .success(.success(let verification)):
            if case .verified(let transaction) = verification {
                await transaction.finish()
            }
            await manager.refreshEntitlements()
            if manager.isSubscribed { finishPurchased() }
        case .success(.userCancelled), .success(.pending):
            break
        case .failure(let error):
            print("[Paywall] purchase failed: \(error)")
        }
    }

    private func finishPurchased() {
        guard !finished else { return }
        finished = true
        onPurchased()
    }
}

// MARK: - iOS 15–16 fallback (StoreKit 2, no SubscriptionStoreView)

private struct LegacyPaywallView: View {
    var onClose: () -> Void
    var onPurchased: () -> Void

    @EnvironmentObject private var manager: SubscriptionManager
    @State private var busy = false
    @State private var message: String?
    @State private var showPrivacy = false
    @State private var showTerms = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    PaywallMarketingHeader()

                    if let product = manager.monthlyProduct {
                        Button {
                            Task { await buy(product) }
                        } label: {
                            Text(busy ? "Please wait…" : "Subscribe \(product.displayPrice) / month")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(busy)
                        .padding(.horizontal, 24)
                    } else {
                        VStack(spacing: 10) {
                            ProgressView()
                            Text(manager.lastError ?? "Loading Premium Earphoria…")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.horizontal, 24)
                    }

                    Button("Restore Purchases") {
                        Task { await restore() }
                    }
                    .disabled(busy)

                    HStack(spacing: 24) {
                        Button("Privacy Policy") { showPrivacy = true }
                        Button("Terms of Use") { showTerms = true }
                    }
                    .font(.footnote)
                    .sheet(isPresented: $showPrivacy) {
                        LegalDocumentView(title: "Privacy Policy", text: LegalCopy.privacyPolicy)
                    }
                    .sheet(isPresented: $showTerms) {
                        LegalDocumentView(title: "Terms of Use", text: LegalCopy.termsOfUse)
                    }

                    if let message {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                }
                .padding(.bottom, 32)
            }
            .background(PaywallPalette.background.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { onClose() }
                }
            }
        }
        .navigationViewStyle(.stack)
        .task {
            await manager.loadProducts(retries: 3)
            await manager.refreshEntitlements()
            if manager.isSubscribed { onPurchased() }
        }
    }

    private func buy(_ product: Product) async {
        busy = true
        defer { busy = false }
        do {
            if try await manager.purchase(product) {
                onPurchased()
            }
        } catch {
            message = error.localizedDescription
        }
    }

    private func restore() async {
        busy = true
        defer { busy = false }
        await manager.restore()
        if manager.isSubscribed {
            onPurchased()
        } else {
            message = "No active subscription found for this Apple ID."
        }
    }
}

// MARK: - Marketing header (3.1.2 title, length, price, auto-renew)

private struct PaywallMarketingHeader: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(PaywallPalette.gold)
                .padding(.top, 28)

            Text("Unlock Premium Earphoria")
                .font(.title.bold())
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .padding(.horizontal, 20)

            Text("Unlock all sounds for all-day focus for $4.99/month. Includes access to new ambient sound additions with future app updates.")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.88))
                .padding(.horizontal, 22)

            VStack(alignment: .leading, spacing: 8) {
                labeled("Premium Earphoria", systemImage: "star.fill")
                labeled("Length: 1 Month", systemImage: "calendar")
                labeled("Price: $4.99/mo", systemImage: "creditcard")
                labeled("Auto-renewable. Cancel anytime in Settings.", systemImage: "arrow.triangle.2.circlepath")
            }
            .padding(.top, 6)

            Text(LegalLinks.autoRenewalNotice)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.55))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 22)
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity)
        .background(PaywallPalette.background)
    }

    private func labeled(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.white.opacity(0.92))
    }
}

private enum PaywallPalette {
    static let background = Color(red: 0.03, green: 0.055, blue: 0.047)
    static let gold = Color(red: 1.0, green: 0.80, blue: 0.12)
}

enum LegalLinks {
    /// Privacy Policy URL opened by SubscriptionStoreView (Guideline 3.1.2).
    /// In-app copy is also presented via `.subscriptionStorePolicyDestination(for:destination:)`.
    static let privacyPolicy = URL(string: "https://sonic-space.net/privacy")!
    /// Apple Standard Licensed Application EULA (Guideline 3.1.2 — permitted Terms of Use).
    static let termsOfUse = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!

    static let autoRenewalNotice = """
    Payment is charged to your Apple ID at confirmation of purchase. This subscription automatically renews unless it is canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscription in Settings → Apple ID → Subscriptions.
    """
}

private struct LegalDocumentView: View {
    let title: String
    let text: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(title)
                    .font(.title2.bold())
                Text(text)
                    .font(.body)
                    .foregroundStyle(.primary.opacity(0.85))
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(PaywallPalette.background.ignoresSafeArea())
        .preferredColorScheme(.dark)
    }
}

enum LegalCopy {
    static let privacyPolicy = """
    Effective: May 2026

    Silverman Music Inc. ("we") is committed to protecting your privacy.

    DATA WE COLLECT
    earphoria™ does not collect, transmit, or store any personal information. No account or login is required. All preferences are stored locally on your device only and are never sent to our servers.

    SUBSCRIPTIONS
    Subscription billing is managed entirely by Apple App Store or Google Play. We do not access your payment information. Please refer to Apple's or Google's privacy policies for details.

    ANALYTICS
    We do not use third-party analytics or tracking SDKs.

    CHILDREN'S PRIVACY
    This app does not knowingly collect data from children under 13.

    CONTACT
    info@sonic-space.net
    """

    static let termsOfUse = """
    Effective: May 2026

    By using earphoria™ ("the App") you agree to these Terms and to Apple's Licensed Application End User License Agreement.

    LICENSE
    Silverman Music Inc. grants you a personal, non-transferable, non-exclusive license to use the App for personal, non-commercial purposes only.

    RESTRICTIONS
    You may not: (a) record or redistribute any audio content; (b) reverse-engineer or decompile the App; (c) use the App for commercial purposes without written consent from Silverman Music Inc.

    MEDICAL DISCLAIMER
    This App is a sound-masking and relaxation aid only. It is not a medical device and makes no claims to diagnose, treat, cure, or prevent any medical condition including tinnitus. Always consult a licensed audiologist or physician for tinnitus-related medical advice.

    SUBSCRIPTIONS
    Premium Earphoria is an auto-renewable subscription. Title: Premium Earphoria. Length: 1 Month. Price: $4.99/mo (or equivalent in your local currency, as shown by the App Store). Payment is charged to your Apple ID at confirmation of purchase. The subscription automatically renews unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel in Settings → Apple ID → Subscriptions.

    DISCLAIMER OF WARRANTIES
    The App is provided "as is" without warranty of any kind. Silverman Music Inc. is not liable for any direct, indirect, or incidental damages arising from use of the App.

    GOVERNING LAW
    These Terms are governed by the laws of the State of California, USA.

    Apple Standard EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

    © 2026 Silverman Music Inc. All rights reserved.
    """
}
