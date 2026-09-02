# n8n Integration

## Principle

n8n is the business automation/integration layer.

It is NOT the realtime voice engine.

## Good uses

After or outside the live call:
- CRM synchronization
- WhatsApp notifications
- email
- reports
- follow-up scheduling
- lead routing
- appointment notifications
- internal alerts

## Example

```text
Voice call
   |
   v
Agent books appointment
   |
   v
NextLite backend commits appointment
   |
   v
event/queue
   |
   v
n8n
   |
   +--> CRM
   +--> WhatsApp
   +--> Email
```

## Reliability

Do not make a critical live-call action depend on an n8n workflow unless there is a synchronous, reliable contract and timeout strategy.

For critical business actions, prefer direct internal tool APIs.

## Webhooks

n8n webhooks should be authenticated and tenant-scoped.

Never expose unrestricted internal endpoints.
