# API Contracts

The exact framework routes may evolve, but the API must follow these domain boundaries.

## Authentication

- login
- logout/session
- email verification
- password/reset or supported auth flow
- current user

## Admin

- create client
- list clients
- get client
- update client
- create/select agent
- manage templates
- manage agent versions
- manage knowledge
- manage tools
- test agent
- deployment operations
- usage/analytics

## Client

- dashboard
- agent status
- deployment status
- usage
- analytics
- billing
- account settings

## Voice runtime

Provider webhooks/events:
- inbound call
- outbound call
- stream/session events
- call connected
- call ended
- recording/transcript events where enabled

Runtime endpoints should be isolated from ordinary dashboard APIs.

## Billing

- create checkout/session
- payment provider webhook
- subscription status
- invoice/payment history

Never activate a subscription based solely on a frontend callback.

## Tool APIs

Tools should be invoked through validated internal interfaces.

Example:

```text
checkAppointmentAvailability(input) -> availability
bookAppointment(input) -> appointment
createLead(input) -> lead
transferCall(input) -> transfer result
```

Use typed schemas and validation.

## API design rules

- version APIs where needed
- validate all inputs
- return consistent errors
- authorize every tenant-scoped operation
- log correlation/request IDs
- never expose secrets
