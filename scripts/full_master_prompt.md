<USER_REQUEST>
# THABAAL — MASTER RAZORPAY BILLING, AUTOPAY, ALL PACKAGES, CUSTOMER CONTACT, PAYMENT FAILURE & WHATSAPP PAYMENT LINK AUDIT, REMEDIATION AND FINAL ACCEPTANCE

## PROJECT INFORMATION

**Project:** Thabaal Multi-Tenant WhatsApp Business SaaS  
**Project Branch:** `HomeNewUi`  
**Production Domain:** `https://thabaal.in`  
**Billing Dashboard:** `/dashboard/account` and `/dashboard/billing`  
**Primary Payment Gateway:** Razorpay  
**Payment Currency:** INR  
**Previous Finforte Tenant ID:** `c_finforte_001`  
**Finforte Official Email:** `rathandeep@candbindia.com`  
**Previous Finforte Growth Monthly Price:** ₹2,999  
**Previous Test Plan:** `plan_U03uhQtnmFLsXF`  
**Previous Test Mode Subscription:** `sub_U05Yyw6nBL4ZJz`

---

# 0. PRIMARY MISSION — COMPLETE THE ENTIRE THABAAL BILLING SYSTEM

Perform a complete, evidence-driven audit, root-cause investigation, correction, testing, and final acceptance of Thabaal's entire billing and payment system.

This is not a limited UPI QR debugging task.

The investigation must cover:

1. Every currently available subscription package.
2. Every supported billing cycle.
3. Correct customer and tenant contact information.
4. Razorpay subscription creation.
5. UPI AutoPay.
6. UPI QR authorization.
7. UPI Intent authorization.
8. Credit and debit card recurring mandates.
9. Netbanking recurring mandates, where supported.
10. One-time payments.
11. WhatsApp payment link generation and delivery.
12. Payment success verification.
13. Payment failures and error recovery.
14. Failed and pending payment handling.
15. Subscription renewal.
16. Subscription cancellation.
17. Razorpay webhooks.
18. Customer receipts.
19. Tenant/admin payment-success notifications.
20. Multi-tenant isolation.
21. Production and Test Mode separation.
22. Deployment consistency.
23. Customer experience across desktop and mobile.

**The final objective is that every Thabaal tenant can select the correct package, receive the correct payment link, use the correct contact details, complete a supported payment method successfully, and have payment/subscription status reflected accurately in Thabaal.**

Do not claim 100% certainty or guarantee zero errors. Achieve the strongest possible evidence-based verification.

Do not stop after the audit. Implement confirmed fixes, execute safe tests, and produce the final Markdown report.

---

# 1. READ ALL PREVIOUS EVIDENCE BEFORE STARTING

Review the latest available reports, including:

1. `THABAAL_RAZORPAY_FINFORTE_UPI_AUTOPAY_FAILURE_ROOT_CAUSE_AND_FIX_REPORT.md`
2. `THABAAL_FINFORTE_OFFICIAL_EMAIL_PAYMENT_NOTIFICATION_FINAL_REPORT.md`
3. `THABAAL_RAZORPAY_FINAL_CUSTOMER_DASHBOARD_END_TO_END_ACCEPTANCE_REPORT.md`
4. `THABAAL_RAZORPAY_CYCLE_END_CANCELLATION_FINAL_VERIFICATION.md`
5. `THABAAL_RAZORPAY_1_RUPEE_TEST_MODE_AUTOPAY_PROVIDER_VERIFICATION_REPORT.md`
6. Any previous billing, plan, WhatsApp campaign, subscription, and payment acceptance reports in the repository.

Use the latest source code, database records, provider evidence, and deployment configuration as the source of truth.

Historical reports are not proof that the current production deployment matches the reported implementation.

Previously reported findings that must be re-evaluated:

### A. Finforte checkout contact information

The previous report identified:

- An old test customer phone number in the Finforte Customer table.
- An empty Finforte `supportPhone`.
- Missing `appearance.billingProfile`.
- Old contact information possibly appearing due to Razorpay Checkout cached data.

A newer billing profile was configured for Finforte with the official contact information.

Reverify this against the actual current database and deployed checkout behavior.

### B. UPI payment failure

The previous production report showed multiple failed UPI attempts with:

- `error_code: BAD_REQUEST_ERROR`
- `error_reason: payment_cancelled`
- `bank: ""`
- `vpa: ""`
- Empty RRN and UPI transaction ID.

Do not assume that this proves NPCI downtime, bank rejection, or a 10-year mandate limit.

Find the actual available failure evidence.

### C. Subscription duration

The previous source reportedly changed:

`TOTAL_COUNT`

from:

`{ m: 120, q: 40, y: 10 }`

to:

`{ m: 12, q: 12, y: 5 }`

Do not blindly accept or reverse this change.

Determine the actual business requirement and Razorpay's documented subscription limits.

A subscription that is expected to continue renewing until cancellation must not silently stop after a shorter fixed billing count.

Document the precise effect of each `total_count` value.

### D. Previous Razorpay cycle-end cancellation

The customer dashboard cancellation flow was previously tested in Test Mode.

Preserve that working functionality.

Retest only if a change affects the cancellation path.

---

# 2. PHASE ONE — CONSOLIDATED SYSTEM INVENTORY

Before editing anything, map the complete billing architecture.

Inspect the actual equivalents of:

- `src/lib/razorpay.ts`
- `src/lib/razorpay-billing.ts`
- `src/lib/subscription.ts`
- `src/app/dashboard/account/page.tsx`
- `src/app/dashboard/account/account-view.tsx`
- `src/app/dashboard/account/billing-types.ts`
- `src/app/dashboard/actions/razorpay.ts`
- Razorpay checkout components.
- Subscription creation routes/actions.
- Payment creation routes/actions.
- Webhook routes.
- Email notification services.
- WhatsApp messaging services.
- Prisma schema and migrations.
- Plan definitions and pricing configuration.
- Entitlement and plan-lock logic.
- Billing history components.
- Customer management modules.
- Payment link generation modules.
- Environment and deployment configuration.

Find every code path that creates, verifies, captures, records, refunds, renews, cancels, or notifies about a payment.

Build an architecture diagram showing:

Customer → Thabaal → Razorpay → Payment/Subscription → Webhook → Verification → Database → Plan Entitlement → Receipt Email → Tenant Notification → WhatsApp Communication.

Do not invent modules or functions that do not exist.

Map each real code path to its actual file and function.

---

# 3. PHASE TWO — AUDIT EVERY SUBSCRIPTION PACKAGE

This is mandatory.

Discover every package from the actual application configuration and database.

Do not assume that the package list is limited to Starter, Growth, and Business.

Identify all current plans and their actual display names.

For every package, audit every supported billing cycle.

Expected possible cycles include:

- Monthly.
- Quarterly.
- Yearly.

Use the actual configured cycle options. Do not create unsupported combinations.

Create a complete package matrix.

Required columns:

| Field | Required Verification |
|---|---|
| Plan name | Correct display name |
| Plan key | Canonical internal plan identifier |
| Razorpay Plan ID | Actual provider plan ID |
| Price | Correct INR value |
| Currency | INR |
| Amount units | Correct rupees-to-paise conversion |
| Billing cycle | Correct interval |
| `total_count` | Intended duration |
| Validity | Correct calculated period |
| First payment | Correct amount |
| Renewal payment | Correct amount |
| Tax | Correct treatment, if applicable |
| Entitlement | Correct plan features |
| Checkout URL | Correct subscription flow |
| AutoPay | Supported payment modes |
| Cancellation | Correct end-of-cycle behavior |
| Upgrade | Correct proration/payment behavior |
| Downgrade | Correct effective date |
| Expiration | Correct access behavior |
| Renewal failure | Correct retry/grace behavior |

## Package-specific verification

For each plan and cycle:

1. Confirm the amount against the canonical Thabaal pricing configuration.
2. Confirm the Razorpay Plan ID corresponds to the correct package.
3. Confirm the currency.
4. Confirm amount conversion to paise.
5. Confirm billing interval.
6. Confirm `total_count`.
7. Confirm initial charge.
8. Confirm subsequent recurring charge.
9. Confirm validity calculation.
10. Confirm tax calculation and display.
11. Confirm entitlement after payment.
12. Confirm failed payment does not grant paid access incorrectly.
13. Confirm cancellation preserves the existing paid period.
14. Confirm renewal does not duplicate entitlement periods.
15. Confirm plan expiry is handled correctly.

Never trust only the UI price.

Compare:

- Frontend price.
- Backend price.
- Razorpay Plan amount.
- Razorpay Subscription amount.
- Payment captured amount.
- Database payment amount.
- Invoice amount.

All must be consistent.

## Important subscription-duration decision

Establish whether the business requirement is:

A. A fixed subscription that terminates after a specified number of successful billing cycles.

B. A recurring subscription that should continue renewing until the customer cancels.

Do not silently choose one.

If historical configuration or current business rules clearly establish the requirement, preserve it and document the evidence.

If the requirement remains ambiguous, prepare a precise comparison and pause only the duration-changing action for business approval. Continue all independent audits and fixes.

Do not reduce every package to 12 cycles merely to work around an assumed UPI rejection.

---

# 4. PHASE THREE — CUSTOMER CONTACT DETAILS MUST BE CORRECT FOR EVERY PAYER

This is a critical system-wide requirement.

The customer must see their own correct phone number and email when paying.

The checkout must never reuse an unrelated tenant's contact details, a developer's test details, or a previous payer's cached values.

## Separate all email/phone identities

The application must distinguish these roles:

### A. Authenticated account contact

The currently authenticated user/customer's actual account details.

### B. Tenant billing contact

The authorized business billing contact for the relevant tenant.

### C. Actual payer details

The person who is making the payment for the subscription or order.

### D. Customer receipt email

The email address to which the actual payer's payment receipt is sent.

### E. Tenant/admin payment-success recipient

The business owner/manager email for payment notifications.

### F. Thabaal Super Admin notification recipient

The platform-level administrative email.

Never combine these roles into one global email field.

## Example: Finforte

Existing official Finforte business details include:

- Tenant: Finforte.
- Tenant ID: `c_finforte_001`.
- Official email: `rathandeep@candbindia.com`.
- Previously configured billing phone: `+91 7339366693`.

These values are examples for verifying the existing Finforte account. Always inspect the canonical current database record before using them.

For a Finforte subscription checkout:

- The payer contact must come from the authorized payer or the selected billing profile.
- The business contact must come from Finforte's canonical billing profile.
- The team notification must go to the official Finforte recipient.
- The customer's own receipt must go to that customer's intended receipt email.

### Example: Other tenant

If Thenan Oils or another business pays:

- The checkout must use the correct payer details associated with that transaction.
- The tenant notification must go to that tenant's own configured manager.
- Finforte's phone or email must never appear accidentally.

## Contact-source priority

Inspect and implement an explicit, documented contact-source resolution order.

Suggested logical priority:

1. Explicitly selected and authorized payer/billing contact for the current checkout.
2. Correct authenticated payer profile, when that user is the payer.
3. Verified tenant billing profile, when the business owner is paying.
4. Existing authorized fallback, only when clearly applicable.

Never silently fall back to another customer's contact details.

Never use browser localStorage or Razorpay cached values as the authoritative source of customer identity.

Treat Razorpay Checkout prefill as a default value, not proof of identity.

Where the checkout supports editing contact details, ensure the actual submitted values are validated and associated with the correct payment record.

## Required contact verification

Inspect the following for all tenants:

- `User.email`.
- User phone fields.
- `Client.supportPhone`.
- `Client.appearance.billingProfile`.
- Customer profile records.
- Razorpay Customer IDs.
- Subscription customer details.
- Checkout `prefill` values.
- Checkout `notes`.
- Payment receipt email.
- Billing profile editor.
- Payment notification settings.

Find all hardcoded fallback contact values.

Search the repository for old test email and phone details from the incident report.

Remove obsolete test defaults where confirmed.

Do not overwrite the customer's existing contact details merely because a tenant manager has a different official notification email.

Create a safe way for authorized users to review or edit payer contact details before payment.

Validate:

- Indian phone number format.
- Country code.
- Email format.
- Whitespace normalization.
- Case normalization.
- Optional fields.
- Missing values.
- Duplicate customer data.
- Cross-tenant association.

Redact PII in logs and reports.

---

# 5. PHASE FOUR — RAZORPAY PAYMENT METHOD COMPATIBILITY

Inspect every payment method actually enabled for the Razorpay merchant account.

Do not assume every account has every payment method activated.

Use the current official Razorpay documentation and available merchant dashboard settings.

Audit:

### A. UPI AutoPay

- UPI recurring mandate creation.
- UPI mandate authorization.
- Monthly recurring debit.
- Quarterly recurring debit.
- Yearly recurring debit.
- UPI mandate amount/limit.
- Mandate validity.
- First payment.
- Subsequent charge.
- Bank and PSP response.
- Supported UPI applications.
- Subscription renewal.
- Cancellation.

### B. UPI QR

- Desktop browser QR generation.
- Mobile QR compatibility.
- Cross-device QR authorization.
- QR expiry.
- QR refresh.
- Duplicate scans.
- Mandate setup timeout.
- Payment failure recovery.

### C. UPI Intent

- Mobile-browser intent handling.
- Supported UPI applications.
- Redirect/callback handling.
- App cancellation.
- App failure.
- Returning to Thabaal.
- Pending mandate recovery.

### D. Credit/Debit Card Recurring Mandates

- Card recurring capability.
- Tokenization/mandate setup.
- Additional authentication requirements.
- First payment.
- Recurring payment.
- Card expiry.
- Insufficient limit.
- Card replacement.
- Recurring authorization revoked.
- Customer cancellation.

### E. Netbanking recurring mandates

Verify availability for the actual Razorpay account and current provider integration.

Do not advertise a mode that is not enabled or supported.

### F. One-time payments

- UPI.
- Cards.
- Netbanking.
- Any other currently enabled payment mode.

Keep recurring and one-time payments separate.

A one-time QR payment must not be mistaken for a completed AutoPay mandate.

## Payment method capability matrix

Create a matrix for every package and supported payment mode:

| Package | Cycle | UPI QR | UPI Intent | Card | Netbanking | One-time Payment |
|---|---|---|---|---|---|---|

Each cell must be classified as:

- `VERIFIED_TEST_MODE`
- `VERIFIED_LIVE_HISTORY`
- `UNAVAILABLE_BY_MERCHANT_CONFIGURATION`
- `NOT_SUPPORTED_BY_PROVIDER_FLOW`
- `FAILED`
- `NOT_TESTED`

Do not infer a success from API documentation alone.

---

# 6. PHASE FIVE — ROOT-CAUSE ANALYSIS OF ALL PAYMENT FAILURES

Inspect actual failed Razorpay transactions and subscription records for all tenants, not just Finforte.

Where available, inspect:

- Payment ID.
- Order ID.
- Subscription ID.
- Tenant ID.
- Plan ID.
- Amount.
- Currency.
- Payment method.
- Status.
- Error code.
- Error description.
- Error source.
- Error step.
- Error reason.
- Bank response.
- PSP response.
- Acquirer response.
- Request ID.
- RRN.
- UPI transaction ID.
- Mandate state.
- Timestamps.
- Webhook events.

Use masked data only.

Group failures by tenant, plan, cycle, payment mode, time, provider error, and bank/PSP where available.

## Investigate the following failure scenarios

### A. Authentication and access

- Invalid Razorpay credentials.
- Test versus Live credentials mismatch.
- Expired credentials.
- Permission restrictions.
- Merchant account restrictions.
- API authentication failure.
- Network/DNS/TLS errors.

### B. Subscription creation

- Invalid plan ID.
- Incorrect amount.
- Amount in rupees instead of paise.
- Wrong currency.
- Invalid interval.
- Invalid total count.
- Missing customer information.
- Incorrect customer ID.
- Unsupported payment method.
- Duplicate subscription.
- Expired subscription.
- Invalid or reused checkout link.

### C. Checkout

- Checkout modal fails to open.
- Checkout fails to load.
- QR code not generated.
- QR expired.
- Incorrect customer prefill.
- Old cached contact details.
- Browser autofill mismatch.
- Customer closes checkout.
- Customer presses Back.
- Network failure during checkout.
- Invalid redirect URL.
- Callback failure.

### D. UPI AutoPay

- PSP unavailable.
- Bank unavailable.
- UPI network timeout.
- NPCI/UPI service failure, where provider evidence establishes it.
- Customer cancels mandate approval.
- UPI app closes.
- UPI app does not return to checkout.
- Mandate registration rejected.
- Unsupported account type.
- Unsupported bank.
- Invalid mandate amount/limit.
- Incorrect validity dates.
- Unsupported frequency.
- Existing conflicting mandate.
- Mandate expires.
- Mandate revoked.
- First payment failure.
- Recurring debit failure.
- UPI Intent failure.
- Cross-device QR authorization failure.

### E. Card and Netbanking

- Authentication failure.
- OTP failure.
- Card expired.
- Card not enabled for recurring use.
- Insufficient balance/limit.
- Bank declines.
- Token/mandate creation failure.
- Additional authorization required.
- Netbanking bank unavailable.
- Redirect failure.

### F. Payment verification

- Payment authorized but not captured.
- Payment failed.
- Payment pending.
- Payment captured but webhook delayed.
- Payment captured but database update failed.
- Duplicate confirmation request.
- Incorrect payment ID.
- Amount mismatch.
- Currency mismatch.
- Order/subscription mismatch.
- Payment belongs to another tenant.
- Payment verified twice.

### G. Subscription lifecycle

- Authenticated but not activated.
- First charge not received.
- Subscription pending.
- Subscription halted.
- Renewal succeeds.
- Renewal fails.
- Mandate revoked.
- Subscription expired.
- Subscription cancelled immediately.
- Subscription cancelled at cycle end.
- Subscription completed after total_count.
- Renewal after plan upgrade.
- Renewal after plan downgrade.

### H. Customer communications

- Payment-success email not sent.
- Email sent to wrong tenant.
- Wrong payer email.
- Duplicate receipt.
- Missing invoice.
- WhatsApp link not sent.
- Wrong WhatsApp customer number.
- Failed WhatsApp template delivery.
- Payment link expired.
- Duplicate payment link.
- Customer pays an outdated link.

For every failure, determine whether it was caused by:

- Thabaal application.
- Razorpay merchant configuration.
- Razorpay API/provider.
- UPI PSP.
- Issuing bank.
- Network/connectivity.
- Customer cancellation.
- Unsupported payment mode.
- Insufficient diagnostic evidence.

Never classify `payment_cancelled` as a bank technical failure without evidence.

---

# 7. PHASE SIX — PAYMENT FAILURE RECOVERY AND CUSTOMER EXPERIENCE

Build or improve safe recovery behavior.

When payment fails:

1. Preserve the original payment attempt.
2. Record the provider failure code and reason.
3. Display a clear customer-friendly message.
4. Provide a safe Retry Payment action.
5. Do not create duplicate subscriptions unnecessarily.
6. Do not grant paid access without confirmed payment.
7. Do not display a successful payment message for pending transactions.
8. Do not ask customers to repeatedly scan an expired QR code.
9. Generate a fresh payment attempt when the existing one cannot be reused.
10. Reconcile uncertain payment outcomes before allowing a second charge.

Use appropriate, evidence-based customer messages.

Examples:

**UPI temporarily unavailable**

"Your UPI AutoPay setup could not be completed. Your bank or payment provider did not confirm the mandate. Please try again later or choose another available payment method."

**Payment pending**

"Your payment is still being confirmed. Please do not make another payment until we verify the existing attempt."

**Payment failed**

"Your payment was not completed. No subscription access has been activated from this failed attempt. You can retry using an available payment method."

**Successful payment**

"Your payment has been successfully verified. Your subscription is now active."

Do not claim a refund or debit outcome unless the provider confirms it.

---

# 8. PHASE SEVEN — WHATSAPP PAYMENT LINK SYSTEM

The business requirement is that Thabaal teams can send the correct payment or subscription link to their customers through WhatsApp.

Implement or verify this as a tenant-safe payment-link workflow.

## A. Subscription payment links

For a subscription:

1. Select the tenant.
2. Select the customer/payer.
3. Select the correct plan.
4. Select the billing cycle.
5. Resolve the correct customer phone/email.
6. Create a customer-specific Razorpay subscription using the verified plan.
7. Obtain the actual Razorpay-hosted authorization URL.
8. Store the subscription ID and payment-link association.
9. Prepare a WhatsApp message.
10. Send using the approved WhatsApp template or permitted messaging path.
11. Track the delivery and customer action.
12. Verify the provider subscription state after authorization.

Do not use a generic `razorpay.me/@thabaal` payment handle as a substitute for a subscription-specific AutoPay authorization URL unless Razorpay explicitly supports the intended recurring flow.

## B. One-time payment links

For one-time charges:

1. Create the correct amount and currency.
2. Associate the correct tenant/customer/order.
3. Generate an appropriate payment link or order checkout URL.
4. Send through WhatsApp.
5. Verify payment.
6. Update the order and receipt.
7. Avoid duplicate charge generation.

## C. WhatsApp message examples

Generate clear, branded, tenant-specific templates.

The message must identify:

- Business name.
- Plan/product.
- Amount.
- Billing cycle.
- Whether it is a one-time payment or recurring subscription.
- Payment link.
- Support/contact information.

Never describe a one-time payment link as AutoPay.

Never promise successful activation before provider confirmation.

## D. Payment link lifecycle

Track:

- Draft.
- Created.
- Sent.
- Delivered, where provider status is available.
- Read, where provider status is available.
- Payment pending.
- Payment successful.
- Payment failed.
- Expired.
- Cancelled.

Use idempotency to prevent repeated link creation on button double-click.

Only resend or create another link after checking the previous payment/subscription state.

## E. WhatsApp multi-tenant safety

Verify:

- Finforte link goes to Finforte customer.
- Thenan Oils link goes to Thenan Oils customer.
- Other tenant links remain isolated.
- Correct sender/phone configuration is used.
- Customer opt-in and applicable template rules are respected.
- No cross-tenant customer information appears.

Preserve existing WhatsApp campaign and messaging behavior.

---

# 9. PHASE EIGHT — EMAIL AND PAYMENT RECEIPT ARCHITECTURE

Preserve the completed Finforte email configuration:

`rathandeep@candbindia.com`

But keep all payment identities separate.

There must be distinct fields for:

1. Payer contact.
2. Customer receipt email.
3. Tenant billing contact.
4. Tenant payment-success notification email.
5. Super Admin alert email.

For Finforte, the payment-success notification must continue routing to the official configured team email.

For other tenants, route to their own authorized manager or configured payment notification recipient.

Check all payment flows:

- Subscription first payment.
- Subscription renewal.
- One-time plan purchase.
- Wallet recharge.
- Other supported paid services.

Ensure:

- Payment success is authoritatively verified before sending.
- Payment failures do not send success notifications.
- Duplicate webhooks do not send duplicate emails.
- Email provider outage does not corrupt payment state.
- Failed email notifications are recoverable.
- Customer receipts remain separate.
- Tenant notifications remain isolated.
- Email logs do not expose sensitive information.

Do not overwrite all payer emails with the Finforte official email.

---

# 10. PHASE NINE — WEBHOOK, PAYMENT STATE MACHINE AND DATABASE INTEGRITY

Audit all current Razorpay events used by the application.

At minimum, inspect:

- `payment.authorized`
- `payment.captured`
- `payment.failed`
- `order.paid`
- `subscription.authenticated`
- `subscription.activated`
- `subscription.charged`
- `subscription.pending`
- `subscription.halted`
- `subscription.cancelled`
- Other events actually implemented in the codebase.

Validate:

1. Webhook signatures.
2. Event ID/idempotency.
3. Duplicate deliveries.
4. Out-of-order events.
5. Delayed events.
6. Database update failures.
7. Transaction consistency.
8. Cross-tenant ID validation.
9. Payment amount validation.
10. Currency validation.
11. Correct plan entitlement.
12. Correct invoice/receipt status.
13. Notification dispatch after payment verification.

Do not let a delayed webhook reactivate a cancelled or expired subscription incorrectly.

Do not let an unauthenticated subscription grant paid access.

Do not let an authorized-only payment be confused with a captured/verified payment.

Do not let a subscription event update a different tenant's records.

Use transactions or existing safe persistence patterns wherever required.

---

# 11. PHASE TEN — SUBSCRIPTION RENEWAL AND CANCELLATION

Preserve the previously tested cycle-end cancellation functionality.

Verify every package and billing cycle:

- Monthly.
- Quarterly.
- Yearly.
- Any additional cycle actually supported.

For each combination, verify:

- Initial subscription.
- First charge.
- Successful renewal.
- Failed renewal.
- Retry state.
- Halted state.
- Customer cancellation.
- Immediate cancellation where supported.
- End-of-cycle cancellation.
- Final cancellation.
- Expiry.
- Paid access.
- Resubscription.

Verify that cancelling AutoPay does not revoke existing paid entitlement prematurely.

Verify that a new purchase does not accidentally attach to an older expired or cancelled subscription.

Verify that `total_count` and remaining cycles match the intended business policy.

Do not use the old 10-year/1-year duration theory as a verified fact without current provider evidence.

---

# 12. PHASE ELEVEN — COMPLETE PACKAGE × PAYMENT METHOD TEST MATRIX

Create an exhaustive matrix based on every actual configured package.

For each package and supported cycle, test applicable payment methods in isolated Test Mode.

Example matrix structure:

| Package | Cycle | Price | UPI QR | UPI Intent | Card Mandate | Netbanking | One-time |
|---|---|---:|---|---|---|---|---|
| Actual package 1 | Monthly | Actual | Result | Result | Result | Result | Result |
| Actual package 1 | Quarterly | Actual | Result | Result | Result | Result | Result |
| Actual package 1 | Yearly | Actual | Result | Result | Result | Result | Result |
| Actual package 2 | Monthly | Actual | Result | Result | Result | Result | Result |

Use only valid combinations from the actual Thabaal configuration.

Each test result must be one of:

- `PASS_PROVIDER_VERIFIED`
- `PASS_TEST_MODE_SIMULATED`
- `FAIL_PROVIDER_ERROR`
- `FAIL_APPLICATION_ERROR`
- `BLOCKED_MERCHANT_CONFIGURATION`
- `NOT_SUPPORTED`
- `NOT_TESTED`

Distinguish provider-verified results from mocked results.

Do not say every package works if only one Growth Monthly test was executed.

## Safe test limits

- Use dedicated QA tenants.
- Use Test Mode credentials.
- Use finite test subscriptions.
- Do not make live charges.
- Do not initiate one real payment for every package.
- Reuse test plans where safely possible.
- Avoid unnecessary duplicate subscriptions.
- Do not cancel existing real customer subscriptions.
- Do not alter production customer entitlements.

---

# 13. PHASE TWELVE — LIVE PRODUCTION READ-ONLY AUDIT

The previous Finforte incident occurred in the live production environment.

Perform a read-only investigation of production records.

Inspect:

- Current package configurations.
- Razorpay plan IDs.
- Active subscriptions.
- Failed payment history.
- Webhook logs.
- Contact mapping.
- Merchant configuration status.
- Email notification configuration.
- WhatsApp payment delivery configuration.
- Deployment identity.
- Active runtime build.
- Current environment mode.

Use read-only GET requests and SELECT statements.

Redact:

- Customer phone numbers.
- Personal emails.
- Payment details.
- API secrets.
- Bank details.
- UPI VPA.

Identify:

- Which customers have active subscriptions.
- Which subscriptions are pending.
- Which customers have failed AutoPay attempts.
- Which subscriptions are duplicates.
- Which payments are pending or uncertain.
- Whether any customer paid but entitlement was not activated.
- Whether any customer received an incorrect receipt.
- Whether any tenant received another tenant's notification.

Do not cancel, charge, refund, delete, or modify production payment records during this audit.

---

# 14. PHASE THIRTEEN — DEPLOYMENT SOURCE AND RUNTIME CONSISTENCY

The previous report mentions direct hot-patching of the live VPS SSR bundle.

This must be audited carefully.

Compare:

- Git source code.
- Current branch.
- Local build.
- Deployed release source.
- Deployed build artifact.
- Active PM2 process.
- Actual production route behavior.
- Production environment configuration.

Verify that all production fixes exist in the actual maintained source code.

Do not rely on a direct hot-patched `.next` bundle as the permanent source of truth.

Verify that the next clean build and deployment preserves all fixes.

Use the project's established deployment and rollback process.

Do not accidentally replace a working release with a partial build.

Do not overwrite production environment secrets.

Before production deployment:

1. Verify the complete build artifact.
2. Verify the target release.
3. Verify environment compatibility.
4. Verify database migrations.
5. Verify rollback availability.
6. Verify the active release identity.
7. Deploy only through the established authorized process.

If an action may affect live billing, payment-provider settings, or customer records, pause for explicit approval.

---

# 15. PHASE FOURTEEN — CUSTOMER UI QUALITY AND PAYMENT EXPERIENCE

Review all customer-facing screens:

- Plan selection.
- Package details.
- Billing cycle selection.
- Checkout modal.
- Contact detail editor.
- Razorpay Checkout.
- UPI QR.
- Payment retry.
- Pending payment.
- Payment success.
- Payment failure.
- Subscription status.
- Billing history.
- Invoice/receipt.
- Cancellation.
- WhatsApp payment-link workflow.

Check:

- Desktop.
- Laptop.
- Tablet.
- Mobile.
- Small mobile.

Required dimensions:

- 1440 × 900.
- 1280 × 800.
- 768 × 1024.
- 390 × 844.
- 360 × 740.

Verify:

- No overflow.
- No clipped modal.
- No misleading price.
- No incorrect contact.
- No stale checkout data.
- No duplicate payment action.
- No false success state.
- Clear customer recovery guidance.
- Accessible buttons.
- Correct keyboard/focus behavior.
- No console errors.
- No hydration errors.
- No missing checkout resources.

Inspect actual rendered screenshots, not only DOM assertions.

---

# 16. PHASE FIFTEEN — COMPREHENSIVE SECURITY AND REGRESSION

Test:

- Tenant A cannot access Tenant B's payment.
- Tenant A cannot cancel Tenant B's subscription.
- Customer cannot change another payer's contact details.
- Staff without billing permission cannot initiate a subscription.
- Payer cannot modify the amount in an untrusted browser request.
- Tenant cannot use another tenant's Razorpay plan/subscription ID.
- Super Admin permissions remain intact.
- Payment email recipients are tenant-scoped.
- Payment webhooks are signature-verified.
- API secrets never reach browser code.
- Razorpay environment separation remains intact.
- QA payment records cannot affect production customer access.

Preserve all unrelated features:

- Campaigns.
- Customer databases.
- Contact import.
- WhatsApp messaging.
- Tenant settings.
- Existing plans.
- Billing history.
- Current paid entitlements.

Do not disable security controls to pass tests.

---

# 17. PHASE SIXTEEN — IMPLEMENT ALL CONFIRMED FIXES

After collecting evidence, identify all actionable defects in one consolidated remediation pass.

Avoid repetitive audit loops.

For each defect:

1. Exact reproduction evidence.
2. Root cause.
3. Affected tenant/package/payment method.
4. Exact source file.
5. Corrective implementation.
6. Regression test.
7. Result.

Implement all independently verifiable and safe fixes.

Do not invent bank/PSP fixes that belong to Razorpay or a bank.

Do not make unsupported claims such as "all banks reject 10-year mandates" without actual evidence.

If the merchant account is not enabled for UPI AutoPay, document the precise Razorpay activation requirement.

If a bank or UPI PSP rejected the mandate, preserve the actual response and classify it accurately.

If an external provider restriction cannot be fixed in Thabaal, provide the exact required external action.

Do not change business billing duration or package prices without explicit evidence and approval.

---

# 18. PHASE SEVENTEEN — MANDATORY FINAL VALIDATION

After implementing fixes, execute relevant tests.

## Test categories

- Every configured subscription package.
- Every supported billing cycle.
- Every enabled recurring payment method.
- One-time payment methods.
- UPI QR.
- UPI Intent.
- Card recurring mandates.
- Netbanking recurring mandates where enabled.
- Correct customer contact mapping.
- Finforte billing profile.
- Other tenant contact profiles.
- WhatsApp payment link generation.
- WhatsApp template delivery using sandbox/mock.
- Payment verification.
- Webhook signature.
- Webhook idempotency.
- Payment receipt.
- Tenant notification.
- Renewal success.
- Renewal failure.
- Customer cancellation.
- Paid entitlement preservation.
- Multi-tenant isolation.
- Error recovery.
- Production configuration safety.

## Required engineering checks

Execute:

1. Dedicated Razorpay payment tests.
2. Subscription lifecycle tests.
3. Payment creation tests.
4. Contact mapping tests.
5. WhatsApp payment-link tests.
6. Webhook tests.
7. Email notification tests.
8. Multi-tenant tests.
9. Failure/retry tests.
10. Playwright customer billing tests.
11. TypeScript validation.
12. Configured lint checks.
13. Production build.
14. Full project regression suite.

Previous baseline was reported as 558 passing tests.

Re-run the actual current test suite and report:

- Total suites.
- Total tests.
- Passed.
- Failed.
- Skipped.
- Cancelled.
- Duration.
- TypeScript result.
- Lint result.
- Build result.

Do not delete tests, weaken assertions, or fabricate passing results.

---

# 19. PHASE EIGHTEEN — FINAL MARKDOWN DELIVERABLE

Create the following file at the project root:

`THABAAL_MASTER_RAZORPAY_BILLING_AUTOPAY_ALL_PACKAGES_FINAL_AUDIT_AND_ACCEPTANCE_REPORT.md`

This is the required final deliverable.

It must be comprehensive but readable, containing the following sections:

## A. Executive summary

- What was inspected.
- What was fixed.
- What remains unresolved.
- Overall evidence-based status.

## B. Complete package matrix

List every real package and cycle.

Include actual prices, Razorpay Plan IDs, billing periods, total count, payment methods, and test outcomes.

## C. Customer contact mapping

Show the correct data source for:

- Authenticated payer.
- Tenant billing contact.
- Customer receipt.
- Tenant payment notification.
- Super Admin.

Include Finforte verification and other tenant isolation evidence.

## D. Razorpay payment architecture

Provide a clear architecture diagram.

## E. UPI AutoPay root cause

Include:

- Original error records.
- Actual provider error codes.
- Error source.
- Error step.
- Bank/PSP evidence where available.
- Correct root-cause classification.
- Explanation of what remains unverified.

## F. All payment failure scenarios

List all scenarios inspected, test result, evidence, and remediation.

## G. Payment link and WhatsApp integration

Explain:

- One-time payment links.
- Subscription authorization links.
- Correct customer contact resolution.
- Message templates.
- Delivery tracking.
- Retry behavior.
- Payment status reconciliation.

## H. Subscription lifecycle

Include:

- Creation.
- Authorization.
- Activation.
- Renewal.
- Failed renewal.
- Retry.
- Halted.
- Cancellation.
- Expiry.
- Resubscription.

## I. Database and webhook integrity

Include tenant isolation, signatures, idempotency, and recovery.

## J. Production deployment verification

Identify source/build/runtime consistency and deployment evidence.

## K. Visual verification

Include Playwright screenshots for desktop and mobile.

## L. Test results

Actual output only.

## M. Remaining external/manual actions

Identify Razorpay merchant activation, bank/PSP restrictions, email provider setup, WhatsApp approval, or other external requirements.

## N. Final acceptance matrix

Mark each requirement:

- `PASS_VERIFIED`
- `PASS_TEST_MODE_ONLY`
- `PARTIALLY_VERIFIED`
- `EXTERNAL_BLOCKER`
- `FAIL`
- `NOT_TESTED`

## O. Final sign-off

Choose one truthful status:

- `FULL_BILLING_SYSTEM_TEST_MODE_VERIFIED_PRODUCTION_CONTROLS_REVIEWED`
- `PRODUCTION_READY_WITH_EXTERNAL_PAYMENT_PROVIDER_LIMITATIONS`
- `PARTIALLY_FIXED`
- `BLOCKED_EXTERNAL_PROVIDER_CONFIGURATION`
- `FAILED`

Do not claim every package works if only selected packages were tested.

Do not claim live UPI AutoPay success from mock or Test Mode data.

Do not claim a real payment was delivered or captured without provider confirmation.

Do not claim a renewal was prevented if its actual billing boundary has not occurred and no authoritative provider evidence proves the schedule.

---

# 20. ABSOLUTE EXECUTION AND SAFETY RULES

1. Start with a consolidated evidence audit.
2. Inspect every configured package.
3. Inspect every supported payment method.
4. Inspect every tenant's contact resolution.
5. Inspect every real payment failure record available.
6. Identify actual UPI AutoPay failure causes.
7. Fix verified application defects.
8. Preserve all customer data.
9. Preserve all existing subscriptions and entitlements.
10. Do not create duplicate subscriptions unnecessarily.
11. Do not make real payments during automated testing.
12. Do not cancel real customer mandates.
13. Do not use production for destructive reproduction.
14. Do not expose API credentials or customer PII.
15. Do not hardcode a global tenant email or phone.
16. Do not alter plan prices or billing duration without approval.
17. Do not silently downgrade package features.
18. Do not claim success based solely on mocks.
19. Do not hot-patch production bundles as a permanent solution.
20. Use clean source-controlled builds and the established release process.
21. Do not stop after producing a diagnosis; implement all safely actionable fixes.
22. Do not repeatedly reopen already verified areas without a concrete reason.

If an action requires external authorization, bank approval, merchant activation, or a new real payment, finish all independent work and list the exact blocker.

---

# FINAL DIRECTIVE

The main requirement is a complete Thabaal billing system that works correctly for every configured package and every supported tenant.

The correct customer contact details must reach Razorpay for each individual checkout.

Finforte team payment notifications must continue going to:

`rathandeep@candbindia.com`

Other tenants must receive their own notifications.

Every successful payment must be authoritatively verified before activation and communication.

Every failure must be diagnosable and recoverable without duplicate charges or incorrect customer messaging.

Every WhatsApp payment link must belong to the correct tenant, payer, package, and billing cycle.

Every subscription renewal and cancellation must respect the actual Razorpay provider state.

**Do one consolidated full audit, gather all missing evidence, implement all confirmed fixes, validate every package and supported payment flow in safe Test Mode, and produce the complete final Markdown report.**

Do not return another incomplete audit summary.

Do not claim 100% certainty without proof.

**Deliver the completed code changes, test evidence, and the final `.md` acceptance report for independent review.**
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-15T19:15:07+05:30.
</ADDITIONAL_METADATA>