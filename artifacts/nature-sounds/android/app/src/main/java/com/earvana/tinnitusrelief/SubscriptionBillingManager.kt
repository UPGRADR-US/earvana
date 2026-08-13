package com.earvana.tinnitusrelief

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.acknowledgePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

/**
 * Google Play Billing integration for the monthly subscription.
 *
 * Product ID:  earphoria499
 * Base Plan:   monthly-plan
 * Type:        BillingClient.ProductType.SUBS
 */
class SubscriptionBillingManager(
    context: Context,
    private val listener: Listener,
) : PurchasesUpdatedListener {

    interface Listener {
        fun onBillingReady()
        fun onBillingError(code: Int, message: String)
        fun onProductDetails(details: ProductDetailsInfo?)
        fun onPurchaseSuccess(purchase: PurchaseInfo)
        fun onPurchaseCanceled()
        fun onPurchasePending(purchase: PurchaseInfo)
        fun onSubscriptionStatus(isActive: Boolean, purchases: List<PurchaseInfo>)
    }

    data class ProductDetailsInfo(
        val productId: String,
        val title: String,
        val description: String,
        val formattedPrice: String?,
        val billingPeriod: String?,
        val basePlanId: String,
        val offerToken: String,
        val raw: ProductDetails,
    )

    data class PurchaseInfo(
        val productIds: List<String>,
        val purchaseToken: String,
        val orderId: String?,
        val isAcknowledged: Boolean,
        val purchaseState: Int,
    )

    companion object {
        private const val TAG = "SubscriptionBilling"
        const val PRODUCT_ID = "earphoria499"
        const val BASE_PLAN_ID = "monthly-plan"
        private const val PREFS = "earphoria_billing"
        private const val KEY_SUBSCRIBED = "is_subscribed"
    }

    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var productDetails: ProductDetails? = null
    private var cachedOfferToken: String? = null

    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val billingClient: BillingClient = BillingClient.newBuilder(appContext)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .build()

    // ── Public API ──────────────────────────────────────────────────────────

    fun startConnection() {
        if (billingClient.isReady) {
            listener.onBillingReady()
            return
        }
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.i(TAG, "Billing client ready")
                    listener.onBillingReady()
                    // Refresh entitlement on connect
                    scope.launch { refreshSubscriptionStatus() }
                } else {
                    Log.e(TAG, "Billing setup failed: ${result.debugMessage}")
                    listener.onBillingError(result.responseCode, result.debugMessage.orEmpty())
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected — will retry on next call")
            }
        })
    }

    fun endConnection() {
        billingClient.endConnection()
    }

    /** Cached local entitlement flag (updated after query / purchase / restore). */
    fun isLocallySubscribed(): Boolean = prefs.getBoolean(KEY_SUBSCRIBED, false)

    /**
     * Query product details for [PRODUCT_ID] and extract the offer token for [BASE_PLAN_ID].
     */
    fun queryProductDetails() {
        scope.launch {
            ensureReady() ?: return@launch
            try {
                val productList = listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build()
                )
                val params = QueryProductDetailsParams.newBuilder()
                    .setProductList(productList)
                    .build()

                val result = withContext(Dispatchers.IO) {
                    billingClient.queryProductDetails(params)
                }

                if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                    listener.onBillingError(
                        result.billingResult.responseCode,
                        result.billingResult.debugMessage.orEmpty()
                    )
                    return@launch
                }

                val details = result.productDetailsList?.firstOrNull()
                if (details == null) {
                    listener.onBillingError(
                        BillingClient.BillingResponseCode.ITEM_UNAVAILABLE,
                        "No product details for $PRODUCT_ID"
                    )
                    listener.onProductDetails(null)
                    return@launch
                }

                productDetails = details
                val offer = details.subscriptionOfferDetails
                    ?.firstOrNull { it.basePlanId == BASE_PLAN_ID }

                if (offer == null) {
                    listener.onBillingError(
                        BillingClient.BillingResponseCode.ITEM_UNAVAILABLE,
                        "No offer for basePlanId=$BASE_PLAN_ID"
                    )
                    listener.onProductDetails(null)
                    return@launch
                }

                cachedOfferToken = offer.offerToken
                val phase = offer.pricingPhases.pricingPhaseList.firstOrNull()
                val info = ProductDetailsInfo(
                    productId = details.productId,
                    title = details.title,
                    description = details.description,
                    formattedPrice = phase?.formattedPrice,
                    billingPeriod = phase?.billingPeriod,
                    basePlanId = offer.basePlanId,
                    offerToken = offer.offerToken,
                    raw = details,
                )
                Log.i(TAG, "Product ready: ${info.productId} ${info.formattedPrice} plan=${info.basePlanId}")
                listener.onProductDetails(info)
            } catch (e: Exception) {
                Log.e(TAG, "queryProductDetails failed", e)
                listener.onBillingError(
                    BillingClient.BillingResponseCode.ERROR,
                    e.message ?: "queryProductDetails failed"
                )
            }
        }
    }

    /**
     * Launch the Play purchase UI for the monthly plan.
     * Requires a prior successful [queryProductDetails] (or will query first).
     */
    fun launchPurchaseFlow(activity: Activity) {
        scope.launch {
            ensureReady() ?: return@launch
            try {
                var details = productDetails
                var token = cachedOfferToken

                if (details == null || token.isNullOrEmpty()) {
                    // Ensure we have product + offer token before launching
                    queryAndCacheProduct()
                    details = productDetails
                    token = cachedOfferToken
                }

                if (details == null || token.isNullOrEmpty()) {
                    listener.onBillingError(
                        BillingClient.BillingResponseCode.ITEM_UNAVAILABLE,
                        "Missing productDetails or offerToken for $BASE_PLAN_ID"
                    )
                    return@launch
                }

                val productDetailsParamsList = listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(token)
                        .build()
                )
                val billingFlowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(productDetailsParamsList)
                    .build()

                val result = billingClient.launchBillingFlow(activity, billingFlowParams)
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    listener.onBillingError(result.responseCode, result.debugMessage.orEmpty())
                }
            } catch (e: Exception) {
                Log.e(TAG, "launchPurchaseFlow failed", e)
                listener.onBillingError(
                    BillingClient.BillingResponseCode.ERROR,
                    e.message ?: "launchPurchaseFlow failed"
                )
            }
        }
    }

    /** Re-query active subscriptions (restore / cold start). */
    fun restorePurchases() {
        scope.launch { refreshSubscriptionStatus() }
    }

    // ── PurchasesUpdatedListener ────────────────────────────────────────────

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (purchases.isNullOrEmpty()) {
                    Log.w(TAG, "OK but empty purchase list")
                    return
                }
                scope.launch {
                    for (purchase in purchases) {
                        handlePurchase(purchase)
                    }
                    refreshSubscriptionStatus()
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                Log.i(TAG, "User canceled purchase")
                listener.onPurchaseCanceled()
            }
            else -> {
                Log.e(TAG, "Purchase failed: ${billingResult.debugMessage}")
                listener.onBillingError(
                    billingResult.responseCode,
                    billingResult.debugMessage.orEmpty()
                )
            }
        }
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private suspend fun ensureReady(): Boolean? {
        if (billingClient.isReady) return true
        return suspendCancellableCoroutine { cont ->
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    if (!cont.isActive) return
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                        cont.resume(true)
                    } else {
                        listener.onBillingError(result.responseCode, result.debugMessage.orEmpty())
                        cont.resume(null)
                    }
                }

                override fun onBillingServiceDisconnected() {
                    // Wait for next retry from caller
                }
            })
        }
    }

    private suspend fun queryAndCacheProduct() {
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        val result = withContext(Dispatchers.IO) {
            billingClient.queryProductDetails(params)
        }
        if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
            listener.onBillingError(
                result.billingResult.responseCode,
                result.billingResult.debugMessage.orEmpty()
            )
            return
        }
        val details = result.productDetailsList?.firstOrNull() ?: return
        productDetails = details
        cachedOfferToken = details.subscriptionOfferDetails
            ?.firstOrNull { it.basePlanId == BASE_PLAN_ID }
            ?.offerToken
    }

    private suspend fun handlePurchase(purchase: Purchase) {
        when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> {
                // Local verification: product must match our subscription SKU
                val ownsOurs = purchase.products.contains(PRODUCT_ID)
                if (!ownsOurs) {
                    Log.w(TAG, "Ignoring unrelated product(s): ${purchase.products}")
                    return
                }

                // Prefer server-side verification of purchase.purchaseToken in production.
                // App privacy model stores prefs only; acknowledge after local checks.
                if (!purchase.isAcknowledged) {
                    acknowledge(purchase)
                }
                setSubscribed(true)
                listener.onPurchaseSuccess(purchase.toInfo())
            }
            Purchase.PurchaseState.PENDING -> {
                listener.onPurchasePending(purchase.toInfo())
            }
            else -> {
                Log.w(TAG, "Unhandled purchase state=${purchase.purchaseState}")
            }
        }
    }

    private suspend fun acknowledge(purchase: Purchase) {
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        val result = withContext(Dispatchers.IO) {
            billingClient.acknowledgePurchase(params)
        }
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
            Log.i(TAG, "Purchase acknowledged")
        } else {
            Log.e(TAG, "Acknowledge failed: ${result.debugMessage}")
            listener.onBillingError(result.responseCode, result.debugMessage.orEmpty())
        }
    }

    private suspend fun refreshSubscriptionStatus() {
        ensureReady() ?: return
        try {
            val params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
            val result = withContext(Dispatchers.IO) {
                billingClient.queryPurchasesAsync(params)
            }
            if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                listener.onBillingError(
                    result.billingResult.responseCode,
                    result.billingResult.debugMessage.orEmpty()
                )
                return
            }

            val active = result.purchasesList.filter { purchase ->
                purchase.purchaseState == Purchase.PurchaseState.PURCHASED &&
                    purchase.products.contains(PRODUCT_ID)
            }

            // Acknowledge any that slipped through
            for (p in active) {
                if (!p.isAcknowledged) acknowledge(p)
            }

            val isActive = active.isNotEmpty()
            setSubscribed(isActive)
            listener.onSubscriptionStatus(isActive, active.map { it.toInfo() })
        } catch (e: Exception) {
            Log.e(TAG, "refreshSubscriptionStatus failed", e)
            listener.onBillingError(
                BillingClient.BillingResponseCode.ERROR,
                e.message ?: "refreshSubscriptionStatus failed"
            )
        }
    }

    private fun setSubscribed(value: Boolean) {
        prefs.edit().putBoolean(KEY_SUBSCRIBED, value).apply()
    }

    private fun Purchase.toInfo() = PurchaseInfo(
        productIds = products,
        purchaseToken = purchaseToken,
        orderId = orderId,
        isAcknowledged = isAcknowledged,
        purchaseState = purchaseState,
    )
}
