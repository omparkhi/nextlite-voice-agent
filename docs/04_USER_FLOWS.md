# User Flows

## A. Client onboarding

```text
Admin creates client
      |
      v
System sends onboarding email
      |
      v
Client verifies account
      |
      v
Client can log in
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
Select template (Appointment Booking, Lead Generation, Customer Support, Receptionist, etc.)
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
   |---- new number
   |---- existing number
   |---- call forwarding
   |
   v
Checkout
   |
   v
Verified payment webhook
   |
   v
Provision/connect telephony
   |
   v
Verify deployment
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
