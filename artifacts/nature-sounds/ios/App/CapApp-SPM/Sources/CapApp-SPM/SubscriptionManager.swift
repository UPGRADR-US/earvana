import Foundation
import StoreKit
import Combine

/// StoreKit 2 subscription state for product `Earvana` (group 22273852 / earvana499).
///
/// Fetches products at launch (sandbox + production) so the IAP is initialized in
/// the binary (App Store Review Guideline 2.1(b)), listens to `Transaction.updates`,
/// and reads `Transaction.currentEntitlements` to persist unlocked access.
@MainActor
public final class SubscriptionManager: ObservableObject {
    public static let shared = SubscriptionManager()

    public static let productID = "Earvana"
    public static let subscriptionGroupID = "22273852"
    public static let subscriptionGroupName = "earvana499"
    public static let freeTrackID = "ocean_high_tide_beach"

    @Published public private(set) var isSubscribed = false
    @Published public private(set) var products: [Product] = []
    @Published public private(set) var lastError: String?

    public var onStatusChange: ((Bool) -> Void)?

    private var updatesTask: Task<Void, Never>?
    private var started = false

    private init() {}

    public var monthlyProduct: Product? {
        products.first { $0.id == Self.productID } ?? products.first { $0.subscription != nil }
    }

    /// False while App Store returns an empty catalog (Paid Apps Agreement pending, etc.).
    /// Freemium locking stays off until a real product is available — otherwise testers are locked out.
    public var catalogAvailable: Bool { monthlyProduct != nil }

    public func start() async {
        if !started {
            started = true
            updatesTask = Task { [weak self] in
                await self?.listenForTransactions()
            }
        }
        await loadProducts(retries: 4)
        await refreshEntitlements()
    }

    /// StoreKit 2 picks sandbox vs production from the environment automatically.
    public func loadProducts(retries: Int = 1) async {
        lastError = nil
        var ids: Set<String> = [Self.productID]
        do {
            let statuses = try await Product.SubscriptionInfo.status(for: Self.subscriptionGroupID)
            for status in statuses {
                if let transaction = try? Self.verified(status.transaction) {
                    ids.insert(transaction.productID)
                }
                if let renewal = try? Self.verified(status.renewalInfo) {
                    ids.insert(renewal.currentProductID)
                }
            }
        } catch {
            print("[SubscriptionManager] group \(Self.subscriptionGroupID) status failed: \(error)")
        }

        for attempt in 1...max(1, retries) {
            do {
                let fetched = try await Product.products(for: ids)
                products = fetched.filter { $0.subscription != nil }
                if products.isEmpty {
                    lastError = "No subscriptions returned for group \(Self.subscriptionGroupID) / \(Self.productID)"
                    print("[SubscriptionManager] empty product list for \(ids.sorted()) (attempt \(attempt)/\(retries))")
                } else {
                    print("[SubscriptionManager] loaded \(products.map(\.id).joined(separator: ",")) in group \(Self.subscriptionGroupID)")
                    lastError = nil
                    return
                }
            } catch {
                lastError = error.localizedDescription
                print("[SubscriptionManager] product fetch failed (attempt \(attempt)/\(retries)): \(error)")
            }
            if attempt < retries {
                let delay = UInt64(attempt) * 800_000_000
                try? await Task.sleep(nanoseconds: delay)
            }
        }
    }

    public static var debugUnlockAvailable: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    public func refreshEntitlements() async {
        #if DEBUG
        if let forced = Self.debugOverride {
            applySubscription(forced)
            return
        }
        #endif
        var active = false
        do {
            let statuses = try await Product.SubscriptionInfo.status(for: Self.subscriptionGroupID)
            active = statuses.contains { status in
                switch status.state {
                case .subscribed, .inGracePeriod, .inBillingRetryPeriod:
                    return true
                default:
                    return false
                }
            }
        } catch {
            print("[SubscriptionManager] entitlement status failed: \(error)")
        }
        if !active {
            for await result in Transaction.currentEntitlements {
                guard let transaction = try? Self.verified(result) else { continue }
                guard transaction.revocationDate == nil else { continue }
                if transaction.productID == Self.productID
                    || products.contains(where: { $0.id == transaction.productID }) {
                    active = true
                    break
                }
            }
        }
        applySubscription(active)
    }

    /// Debug builds only. Lets you preview unlock/lock without a StoreKit purchase.
    public func setDebugSubscribed(_ active: Bool) {
        #if DEBUG
        Self.debugOverride = active
        isSubscribed = active
        onStatusChange?(active)
        #endif
    }

    public func restore() async {
        do {
            try await AppStore.sync()
        } catch {
            lastError = error.localizedDescription
            print("[SubscriptionManager] AppStore.sync failed: \(error)")
        }
        await refreshEntitlements()
    }

    public func purchase(_ product: Product) async throws -> Bool {
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            let transaction = try Self.verified(verification)
            await transaction.finish()
            await refreshEntitlements()
            return isSubscribed
        case .userCancelled:
            return false
        case .pending:
            return false
        @unknown default:
            return false
        }
    }

    public func isTrackLocked(_ trackID: String) -> Bool {
        guard catalogAvailable else { return false }
        return trackID != Self.freeTrackID && !isSubscribed
    }

    private func listenForTransactions() async {
        for await result in Transaction.updates {
            do {
                let transaction = try Self.verified(result)
                await transaction.finish()
                await refreshEntitlements()
            } catch {
                print("[SubscriptionManager] unverified transaction: \(error)")
            }
        }
    }

    private func applySubscription(_ active: Bool) {
        let changed = isSubscribed != active
        isSubscribed = active
        if changed {
            onStatusChange?(active)
        }
    }

    private static let debugOverrideKey = "earphoria.debug.forceSubscribed"

    private static var debugOverride: Bool? {
        get {
            guard UserDefaults.standard.object(forKey: debugOverrideKey) != nil else { return nil }
            return UserDefaults.standard.bool(forKey: debugOverrideKey)
        }
        set {
            if let newValue = newValue {
                UserDefaults.standard.set(newValue, forKey: debugOverrideKey)
            } else {
                UserDefaults.standard.removeObject(forKey: debugOverrideKey)
            }
        }
    }

    nonisolated private static func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let value):
            return value
        }
    }
}
