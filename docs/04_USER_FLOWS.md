# User Flows

## A. Client onboarding

```text
Admin creates client
      |
      v
System sends onboarding email (Resend)
      |
      v
Client verifies account
      |
      v
Client can log in (custom JWT)
      |
      v
Admin continues technical setup
```

No payment is required at initial account creation.

## B. Agent preparation

```text
Admin selects client
   |
   v
Select template
   |
   v
Configure identity/role
   |
   v
Configure language/voice
   |
   v
Add business information
   |
   v
Add knowledge
   |
   v
Configure tools/integrations
   |
   v
Configure behavior/escalation
   |
   v
Test agent
   |
   v
Improve
   |
   +----> test again
   |
   v
Ready for deployment
```

## C. Deployment + payment

```text
Agent ready
   |
   v
Client approves deployment
   |
   v
Choose plan
   |
   v
Choose deployment method
   |---- new number (Plivo)
   |---- existing number (if supported)
   |---- call forwarding
   |
   v
Checkout (Cashfree order/subscription)
   |
   v
Cashfree payment page
   |
   v
Verified payment webhook (PAYMENT_SUCCESS_WEBHOOK)
   |
   v
Provision/connect telephony (Plivo)
   |
   v
Verify deployment (test call)
   |
   v
Test real call
   |
   v
ACTIVE + LIVE
```

## D. Failure handling

If payment succeeds but deployment fails:
- do not silently mark the service live
- record deployment failure
- show actionable status
- allow retry
- handle refund/credit according to billing policy

## E. Client post-deployment

Client sees:
- agent status
- phone number/deployment status
- plan
- usage
- call analytics
- business metrics
- billing

Technical configuration remains primarily controlled by NextLite Admin.

## F. Outbound call flow

```text
Admin initiates outbound call
   |
   v
Select agent
   |
   v
Select lead/customer
   |
   v
Pass context (lead info, call purpose)
   |
   v
Plivo Make Call API (from Plivo number to customer number)
   |
   v
Same Voice Runtime as inbound
   |
   v
Agent conversation with lead/customer
   |
   v
Tools execution (appointments, leads, etc.)
   |
   v
Call ends
   |
   v
Transcript saved
   |
   v
Outcome recorded
   |
   v
Usage/cost metered
```
