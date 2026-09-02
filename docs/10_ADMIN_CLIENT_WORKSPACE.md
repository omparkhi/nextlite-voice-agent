# Admin and Client Workspace

## Admin dashboard

Primary navigation:
- Dashboard
- Clients
- Agents/Templates
- Deployments
- Calls
- Analytics
- Usage
- Settings

## Client management

Admin can:
- create client
- view client
- edit onboarding details
- see plan/payment state
- enter client workspace
- manage agent
- manage deployment

## Agent workspace

Suggested sections:
- Overview
- Instructions
- Variables
- Knowledge
- Tools
- Voice
- Language
- Settings
- Tests
- Deployment

The exact UI may evolve, but the domain concepts must remain.

## Agent configuration

Admin controls:
- name
- role
- business
- voice
- language
- personality
- greeting
- behavior
- business information
- knowledge
- tools
- escalation
- appointment/lead rules

## Test experience

Admin must be able to:
- start test call/conversation
- test scenarios
- inspect failures
- update configuration
- retest

## AI configuration assistant

Provide a chat-like interface for agent configuration changes.

Every configuration change should be reviewable before destructive overwrite where practical.

## Client dashboard

Keep simple:
- agent status
- number/deployment
- plan
- usage
- calls
- analytics
- billing

Do not expose low-level STT/TTS/LLM/WebSocket configuration in the initial client dashboard.
