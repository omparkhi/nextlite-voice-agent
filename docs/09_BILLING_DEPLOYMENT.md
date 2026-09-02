# Billing and Deployment

## Business decision

Payment is collected when the client is ready to deploy, not during initial account creation.

## Payment provider

Cashfree is the payment provider.

Key integration points:
- Create Order API for one-time checkout payments
- Subscription API for recurring billing mandates
- Webhook signature verification (HMAC-SHA256)
- Sandbox environment for testing

## Deployment checkout flow

```text
Agent READY
   |
   v
Client approves
   |
   v
Select plan
   |
   v
Select number method
   |
   v
Checkout (Cashfree)
   |
   v
Cashfree payment page
   |
   v
Verified payment webhook (PAYMENT_SUCCESS_WEBHOOK)
   |
   v
PAYMENT_SUCCESS
   |
   v
DEPLOYING
   |
   v
Telephony provision/connect (Plivo)
   |
   v
Verification (test call)
   |
   v
ACTIVE + LIVE
```

## Subscription state

Use explicit state transitions.

Do not mark ACTIVE before payment is verified via Cashfree webhook.

Do not claim LIVE until telephony and agent deployment are verified.

## Number methods

Initial supported product concepts:
1. Rent/provision a new Plivo number (080/022 landline series for service/transactional)
2. Connect an existing number where provider/telephony support allows (requires Plivo verification)
3. Call forwarding to a NextLite Plivo number

The exact capabilities depend on Plivo's India capabilities and TRAI regulations.

## Plivo India requirements

For India deployments:
- India data region Plivo account required
- KYC compliance: GST Certificate, Certificate of Incorporation, or Udyam Registration
- Compliance application approval required before renting numbers
- 080/022 numbers: automated review within 5 minutes
- Number types: landline (080/022) for service/transactional only
- Caller ID must be a Plivo-rented number
- Media anchoring: both call legs must be in India

## Payment failure

Payment failure:
- deployment does not begin
- subscription remains non-active
- user can retry

## Deployment failure after payment

Record:
- payment success
- deployment failure reason
- retry status

Do not lose the payment record.

Product/billing policy should define whether failed deployment results in retry, credit, or refund.

## Pricing

Plan prices and vendor rates must be configuration/database values, not source-code constants.

Vendor pricing changes must be verified before production decisions.
