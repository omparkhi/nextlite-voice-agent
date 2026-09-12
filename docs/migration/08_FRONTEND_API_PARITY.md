# Frontend React API Consumer Parity

**Client Source:** `apps/web/src/services/api.ts`  
**Total Mapped Endpoints:** 34  
**Audit Date:** September 2026

---

## 1. React API Consumer Matrix

| Frontend API Function | HTTP Method | Endpoint URL | Auth Header | Consuming Component / Page | Target FastAPI Route |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `login` | `POST` | `/api/auth/login` | None (Public) | `LoginPage.tsx` | `POST /api/auth/login` |
| `register` | `POST` | `/api/auth/register` | None (Public) | `RegisterPage.tsx` | `POST /api/auth/register` |
| `refreshToken` | `POST` | `/api/auth/refresh` | Cookie / Body | `AuthContext.tsx` | `POST /api/auth/refresh` |
| `logout` | `POST` | `/api/auth/logout` | User Bearer | `CrmTopbar.tsx` | `POST /api/auth/logout` |
| `getAgents` | `GET` | `/api/admin/agents` | Admin Bearer | `AgentList.tsx` | `GET /api/admin/agents` |
| `getAgent` | `GET` | `/api/admin/agents/:id` | Admin Bearer | `AgentDetail.tsx`, `AgentBuilder.tsx` | `GET /api/admin/agents/{id}` |
| `createAgent` | `POST` | `/api/admin/agents` | Admin Bearer | `AgentBuilder.tsx` | `POST /api/admin/agents` |
| `updateAgent` | `PATCH` | `/api/admin/agents/:id` | Admin Bearer | `AgentBuilder.tsx` | `PATCH /api/admin/agents/{id}` |
| `deleteAgent` | `DELETE` | `/api/admin/agents/:id` | Admin Bearer | `AgentList.tsx` | `DELETE /api/admin/agents/{id}` |
| `createVersion` | `POST` | `/api/admin/agents/:id/versions` | Admin Bearer | `AgentBuilder.tsx` | `POST /api/admin/agents/{id}/versions` |
| `deployAgent` | `POST` | `/api/admin/agents/:id/deploy` | Admin Bearer | `AgentBuilder.tsx` | `POST /api/admin/agents/{id}/deploy` |
| `getRuntimePreview` | `GET` | `/api/admin/agents/:id/runtime-preview` | Admin Bearer | `PromptPreviewModal.tsx` | `GET /api/admin/agents/{id}/runtime-preview` |
| `getKnowledgeSources` | `GET` | `/api/admin/knowledge/sources` | Admin Bearer | `KnowledgeManager.tsx` | `GET /api/admin/knowledge/sources` |
| `uploadKnowledge` | `POST` | `/api/admin/knowledge/upload` | Admin Bearer | `KnowledgeManager.tsx` | `POST /api/admin/knowledge/upload` |
| `deleteKnowledge` | `DELETE` | `/api/admin/knowledge/sources/:id` | Admin Bearer | `KnowledgeManager.tsx` | `DELETE /api/admin/knowledge/sources/{id}` |
| `getDashboardMetrics` | `GET` | `/api/client/dashboard` | Client Bearer | `Dashboard.tsx` | `GET /api/client/dashboard` |
| `getCalls` | `GET` | `/api/client/calls` | Client Bearer | `Calls.tsx` | `GET /api/client/calls` |
| `getCallDetails` | `GET` | `/api/client/calls/:id` | Client Bearer | `CallDetailsDrawer.tsx` | `GET /api/client/calls/{id}` |
| `getLeads` | `GET` | `/api/client/leads` | Client Bearer | `Leads.tsx` | `GET /api/client/leads` |
| `updateLead` | `PATCH` | `/api/client/leads/:id` | Client Bearer | `LeadDetailsDrawer.tsx` | `PATCH /api/client/leads/{id}` |
| `getAppointments` | `GET` | `/api/client/appointments` | Client Bearer | `Appointments.tsx` | `GET /api/client/appointments` |
| `updateAppointment`| `PATCH` | `/api/client/appointments/:id`| Client Bearer | `AppointmentDetailsDrawer.tsx`| `PATCH /api/client/appointments/{id}`|
| `sendWhatsApp` | `POST` | `/api/client/whatsapp/send` | Client Bearer | `WhatsAppComposer.tsx` | `POST /api/client/whatsapp/send` |
| `triggerPhoneTest` | `POST` | `/api/admin/phone-test/call` | Admin Bearer | `PhoneCallTest.tsx` | `POST /api/admin/phone-test/call` |

---

## 2. Frontend Compatibility Guarantee

The Python FastAPI Control Plane will replicate every single endpoint path, request body, query parameter, HTTP status code, and JSON response schema verbatim. No frontend code alterations will be required.