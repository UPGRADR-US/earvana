package com.earvana.tinnitusrelief

import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for [SubscriptionBillingManager].
 *
 * Methods: initialize, getProductDetails, purchase, restore, getSubscriptionStatus
 * Events:  billingReady, productDetails, purchaseSuccess, purchaseCanceled,
 *          purchasePending, subscriptionStatus, billingError
 */
@CapacitorPlugin(name = "EarphoriaBilling")
class BillingPlugin : Plugin() {

    companion object {
        private const val TAG = "EarphoriaBilling"
    }

    private var billing: SubscriptionBillingManager? = null

    // Pending calls waiting for async billing responses
    private var pendingProductCall: PluginCall? = null
    private var pendingPurchaseCall: PluginCall? = null
    private var pendingRestoreCall: PluginCall? = null
    private var pendingStatusCall: PluginCall? = null

    private val billingListener = object : SubscriptionBillingManager.Listener {
        override fun onBillingReady() {
            notifyListeners("billingReady", JSObject())
        }

        override fun onBillingError(code: Int, message: String) {
            val data = JSObject().apply {
                put("code", code)
                put("message", message)
            }
            notifyListeners("billingError", data)
            failPending(pendingProductCall, message).also { pendingProductCall = null }
            failPending(pendingPurchaseCall, message).also { pendingPurchaseCall = null }
            failPending(pendingRestoreCall, message).also { pendingRestoreCall = null }
            failPending(pendingStatusCall, message).also { pendingStatusCall = null }
        }

        override fun onProductDetails(details: SubscriptionBillingManager.ProductDetailsInfo?) {
            if (details == null) {
                val err = "Product details unavailable"
                failPending(pendingProductCall, err)
                pendingProductCall = null
                notifyListeners("productDetails", JSObject().put("available", false))
                return
            }
            val obj = details.toJS()
            obj.put("available", true)
            notifyListeners("productDetails", obj)
            pendingProductCall?.resolve(obj)
            pendingProductCall = null
        }

        override fun onPurchaseSuccess(purchase: SubscriptionBillingManager.PurchaseInfo) {
            val obj = purchase.toJS()
            obj.put("isSubscribed", true)
            notifyListeners("purchaseSuccess", obj)
            pendingPurchaseCall?.resolve(obj)
            pendingPurchaseCall = null
        }

        override fun onPurchaseCanceled() {
            notifyListeners("purchaseCanceled", JSObject())
            pendingPurchaseCall?.reject("User canceled", "USER_CANCELED")
            pendingPurchaseCall = null
        }

        override fun onPurchasePending(purchase: SubscriptionBillingManager.PurchaseInfo) {
            val obj = purchase.toJS()
            notifyListeners("purchasePending", obj)
            // Keep the purchase call open until final state, but also surface pending
            pendingPurchaseCall?.resolve(obj.put("pending", true))
            pendingPurchaseCall = null
        }

        override fun onSubscriptionStatus(
            isActive: Boolean,
            purchases: List<SubscriptionBillingManager.PurchaseInfo>,
        ) {
            val obj = JSObject().apply {
                put("isSubscribed", isActive)
                put("productId", SubscriptionBillingManager.PRODUCT_ID)
                put("basePlanId", SubscriptionBillingManager.BASE_PLAN_ID)
                val arr = JSArray()
                purchases.forEach { arr.put(it.toJS()) }
                put("purchases", arr)
            }
            notifyListeners("subscriptionStatus", obj)
            pendingRestoreCall?.resolve(obj)
            pendingRestoreCall = null
            pendingStatusCall?.resolve(obj)
            pendingStatusCall = null
        }
    }

    override fun load() {
        super.load()
        billing = SubscriptionBillingManager(context, billingListener).also {
            it.startConnection()
        }
        Log.i(TAG, "Plugin loaded — connecting to Play Billing")
    }

    override fun handleOnDestroy() {
        billing?.endConnection()
        billing = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun initialize(call: PluginCall) {
        val mgr = billing
        if (mgr == null) {
            call.reject("Billing manager not available")
            return
        }
        mgr.startConnection()
        call.resolve(
            JSObject().apply {
                put("productId", SubscriptionBillingManager.PRODUCT_ID)
                put("basePlanId", SubscriptionBillingManager.BASE_PLAN_ID)
                put("isSubscribed", mgr.isLocallySubscribed())
            }
        )
    }

    @PluginMethod
    fun getProductDetails(call: PluginCall) {
        val mgr = billing ?: run {
            call.reject("Billing manager not available")
            return
        }
        pendingProductCall?.reject("Superseded by newer request")
        pendingProductCall = call
        mgr.queryProductDetails()
    }

    @PluginMethod
    fun purchase(call: PluginCall) {
        val mgr = billing ?: run {
            call.reject("Billing manager not available")
            return
        }
        val activity = activity
        if (activity == null) {
            call.reject("Activity not available")
            return
        }
        pendingPurchaseCall?.reject("Superseded by newer request")
        pendingPurchaseCall = call
        mgr.launchPurchaseFlow(activity)
    }

    @PluginMethod
    fun restore(call: PluginCall) {
        val mgr = billing ?: run {
            call.reject("Billing manager not available")
            return
        }
        pendingRestoreCall?.reject("Superseded by newer request")
        pendingRestoreCall = call
        mgr.restorePurchases()
    }

    @PluginMethod
    fun getSubscriptionStatus(call: PluginCall) {
        val mgr = billing ?: run {
            call.reject("Billing manager not available")
            return
        }
        // Refresh from Play (also resolves via onSubscriptionStatus)
        pendingStatusCall?.reject("Superseded by newer request")
        pendingStatusCall = call
        mgr.restorePurchases()
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private fun failPending(call: PluginCall?, message: String) {
        call?.reject(message)
    }

    private fun SubscriptionBillingManager.ProductDetailsInfo.toJS() = JSObject().apply {
        put("productId", productId)
        put("title", title)
        put("description", description)
        put("formattedPrice", formattedPrice)
        put("billingPeriod", billingPeriod)
        put("basePlanId", basePlanId)
        put("offerToken", offerToken)
    }

    private fun SubscriptionBillingManager.PurchaseInfo.toJS() = JSObject().apply {
        put("purchaseToken", purchaseToken)
        put("orderId", orderId)
        put("isAcknowledged", isAcknowledged)
        put("purchaseState", purchaseState)
        val ids = JSArray()
        productIds.forEach { ids.put(it) }
        put("productIds", ids)
    }
}
