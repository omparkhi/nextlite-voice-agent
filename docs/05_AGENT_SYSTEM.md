# Agent System

## Agent model

Every agent is a structured configuration, not just a text prompt.

```text
Agent
├── Identity
├── Role
├── Goal
├── Voice
├── Language
├── Personality
├── Business Information
├── Knowledge
├── Conversation Rules
├── Tools
├── Appointment Rules
├── Lead Rules
├── Escalation/Handoff Rules
└── System Instructions
```

## Templates

Templates provide initial configuration for a use case.

Example:
`Hospital Appointment Agent`

may define:
- receptionist identity
- appointment goal
- required patient information
- appointment tool requirements
- emergency escalation behavior
- concise speaking style

Templates must remain editable per client.

## Prompt generation

The runtime should generate the effective system configuration from structured settings.

Conceptually:

```text
Template
+
Client configuration
+
Business data
+
Knowledge policy
+
Tools
+
Safety/escalation rules
=
Runtime agent configuration
```

The generated configuration should be inspectable by Admin.

## AI configuration assistant

Admin can request changes in natural language:
- make responses shorter
- ask one question at a time
- change tone
- add a rule
- improve appointment flow

The assistant should modify structured configuration where possible.

It must not blindly overwrite unrelated settings.

Every meaningful configuration change should be versionable/auditable.

## Tool calling

Tools must have:
- explicit name
- input schema
- output schema
- authorization/tenant context
- timeout
- error behavior

Examples:
- check appointment availability
- create appointment
- reschedule appointment
- cancel appointment
- create lead
- update CRM
- transfer to human

## Knowledge

Knowledge can come from:
- business information
- FAQs
- documents
- website content where later supported
- product/service information
- policies

Use PostgreSQL + pgvector initially unless a concrete scale requirement justifies another vector store.

The agent must not invent business facts that are absent from its configured knowledge.
