# Product Requirements

## 1. Product vision

NextLite Voice deploys AI employees that handle phone conversations and business actions for Indian businesses.

The product is not positioned merely as an AI calling bot. It is an AI employee platform.

## 2. Initial target industries

- Hospitals
- Clinics
- Coaching institutes
- Finance/loan businesses
- Automobile businesses
- Real estate
- Other service businesses

## 3. Initial agent categories

Templates should be extensible. Initial examples:
- Receptionist
- Appointment Booking
- Appointment Reminder
- Patient Inquiry
- Loan Lead Qualification
- Loan Inquiry
- Sales/Lead Qualification
- Follow-up
- Real Estate Lead Qualification
- Site Visit Booking
- Education Admission Counselling
- Automobile Sales
- Automobile Service

## 4. Client responsibilities

Client:
- verifies account
- selects a plan at deployment
- pays
- uses the deployed service
- views status, usage, analytics and billing

Client does not initially configure the technical voice agent.

## 5. NextLite responsibilities

NextLite team:
- creates/onboards clients
- chooses templates
- configures agents
- adds knowledge
- configures voice/language
- configures tools/integrations
- tests agents
- improves agents
- connects/deploys numbers
- monitors usage and deployments

## 6. Core business outcome

The agent should not merely converse. It should complete business tasks where configured:
- answer questions
- qualify leads
- book appointments
- reschedule/cancel appointments
- collect required information
- trigger follow-ups
- transfer/escalate to humans
- update CRM/business systems
- make outbound calls to leads/customers
- handle inbound calls from leads/customers

## 7. MVP boundary

The first product must prove:
1. client creation
2. client verification/login
3. agent template selection
4. structured agent configuration
5. knowledge configuration
6. agent testing
7. deployment readiness
8. plan selection/payment (Cashfree)
9. telephony connection (Plivo)
10. inbound live calls
11. outbound live calls (basic)
12. basic usage/analytics

Advanced billing, large-scale analytics, sophisticated self-service, and model self-hosting are later phases.

## 8. Outbound calling

Core outbound calling is part of MVP.

Use cases:
- AI calls loan leads (finance)
- AI calls admission leads (education)
- AI calls property leads (real estate)
- AI calls sales/service leads (automobile)
- AI calls appointment reminders/follow-ups (hospital)

MVP outbound scope:
- manual/basic outbound call initiation
- agent selection
- lead/customer selection
- context passing
- realtime AI conversation (same voice runtime as inbound)
- tools
- transcript
- outcome
- usage/cost metering
- failed/busy/no-answer handling
- human handoff where supported

Post-MVP:
- advanced campaigns
- predictive dialing
- bulk campaign management
- sophisticated scheduling
- advanced segmentation
