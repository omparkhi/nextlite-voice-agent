import math
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import Subscription, SubscriptionStatus, CallSession, Tenant

PLANS_CATALOG = {
    "STARTER": {
        "tier": "STARTER",
        "name": "Starter Plan",
        "description": "Perfect for solo practitioners, clinics, and small businesses starting with voice AI.",
        "monthlyPrice": 4999.0,
        "yearlyPrice": 49990.0,
        "yearlySavings": 9998.0,
        "includedMinutes": 500,
        "payAsYouGoRate": 7.0,
        "features": [
            "500 minutes included",
            "1 dedicated virtual phone number (DID)",
            "1 AI receptionist agent",
            "Hindi + English voice support",
            "Real-time appointment booking",
            "Basic clinic FAQ handling",
            "Call summary & transcripts",
            "Google Calendar integration",
            "Basic operational dashboard",
            "Free maintenance & error solving"
        ]
    },
    "GROWTH": {
        "tier": "GROWTH",
        "name": "Growth Plan",
        "description": "Ideal for growing businesses needing multichannel communication and CRM syncing.",
        "monthlyPrice": 9999.0,
        "yearlyPrice": 99990.0,
        "yearlySavings": 19998.0,
        "includedMinutes": 1200,
        "payAsYouGoRate": 7.0,
        "features": [
            "1,200 minutes included",
            "Hindi, English & Marathi voice support",
            "Real-time appointment booking",
            "Automated WhatsApp confirmation dispatch",
            "CRM & lead pipeline integration",
            "Live call transfer to clinic staff",
            "Detailed call summaries & insights",
            "Knowledge base PDF/DOC sync",
            "Comprehensive clinic analytics",
            "Free maintenance & error solving"
        ]
    },
    "PRO": {
        "tier": "PRO",
        "name": "Pro Plan",
        "description": "Built for high-volume clinics, multiple doctors, multi-workflow enterprise operations.",
        "monthlyPrice": 24999.0,
        "yearlyPrice": 249990.0,
        "yearlySavings": 49998.0,
        "includedMinutes": 3000,
        "payAsYouGoRate": 7.0,
        "features": [
            "3,000 minutes included",
            "Multiple doctors & multi-specialty workflows",
            "Enterprise CRM & multi-branch support",
            "Automated WhatsApp confirmations & follow-ups",
            "Smart priority call transfer",
            "Advanced analytics & peak call metrics",
            "Custom clinic knowledge base",
            "Priority 24/7 dedicated support",
            "Free maintenance & error solving"
        ]
    }
}


class SubscriptionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def get_catalog() -> Dict[str, Any]:
        return {
            "plans": list(PLANS_CATALOG.values()),
            "defaultPayAsYouGoRate": 7.0
        }

    async def get_or_create_subscription(self, tenant_id: uuid.UUID) -> Subscription:
        res = await self.session.execute(
            select(Subscription).where(Subscription.tenantId == tenant_id)
        )
        sub = res.scalar_one_or_none()
        if not sub:
            now = datetime.utcnow()
            period_end = now + timedelta(days=30)
            starter = PLANS_CATALOG["STARTER"]
            sub = Subscription(
                id=uuid.uuid4(),
                tenantId=tenant_id,
                planTier="STARTER",
                planName="Starter Plan (Monthly)",
                billingCycle="monthly",
                basePrice=starter["monthlyPrice"],
                finalPrice=starter["monthlyPrice"],
                discountAmount=0.0,
                includedMinutes=starter["includedMinutes"],
                payAsYouGoRate=starter["payAsYouGoRate"],
                features=starter["features"],
                adminNotes="Default starter plan initialized",
                status=SubscriptionStatus.ACTIVE,
                startedAt=now,
                currentPeriodEnd=period_end,
                createdAt=now,
                updatedAt=now
            )
            self.session.add(sub)
            await self.session.commit()
            await self.session.refresh(sub)
        return sub

    async def get_subscription_with_usage(self, tenant_id: uuid.UUID) -> Dict[str, Any]:
        sub = await self.get_or_create_subscription(tenant_id)
        
        # Calculate voice minutes from call_sessions
        start_time = sub.startedAt or (datetime.utcnow() - timedelta(days=30))
        end_time = sub.currentPeriodEnd or (datetime.utcnow() + timedelta(days=30))

        usage_stmt = select(
            func.coalesce(func.sum(CallSession.durationSeconds), 0).label("total_seconds"),
            func.count(CallSession.id).label("total_calls")
        ).where(
            CallSession.tenantId == tenant_id,
            CallSession.createdAt >= start_time
        )
        usage_res = await self.session.execute(usage_stmt)
        total_seconds, total_calls = usage_res.first() or (0, 0)
        
        used_minutes = math.ceil(total_seconds / 60.0) if total_seconds > 0 else 0
        included = sub.includedMinutes or 500
        remaining_minutes = max(0, included - used_minutes)
        overage_minutes = max(0, used_minutes - included)
        overage_charge = round(overage_minutes * (sub.payAsYouGoRate or 7.0), 2)
        usage_percentage = min(100.0, round((used_minutes / included) * 100, 1)) if included > 0 else 100.0

        return {
            "id": str(sub.id),
            "tenantId": str(sub.tenantId),
            "planTier": sub.planTier,
            "planName": sub.planName or f"{sub.planTier.capitalize()} Plan",
            "billingCycle": sub.billingCycle,
            "basePrice": sub.basePrice,
            "finalPrice": sub.finalPrice,
            "discountAmount": sub.discountAmount,
            "includedMinutes": included,
            "payAsYouGoRate": sub.payAsYouGoRate,
            "features": sub.features or [],
            "adminNotes": sub.adminNotes,
            "status": sub.status.value if hasattr(sub.status, "value") else str(sub.status),
            "startedAt": sub.startedAt.isoformat() if sub.startedAt else None,
            "currentPeriodEnd": sub.currentPeriodEnd.isoformat() if sub.currentPeriodEnd else None,
            "usage": {
                "totalCalls": total_calls,
                "usedSeconds": total_seconds,
                "usedMinutes": used_minutes,
                "includedMinutes": included,
                "remainingMinutes": remaining_minutes,
                "overageMinutes": overage_minutes,
                "overageRatePerMinute": sub.payAsYouGoRate,
                "overageCharge": overage_charge,
                "usagePercentage": usage_percentage
            }
        }

    async def assign_plan(
        self,
        tenant_id: uuid.UUID,
        plan_tier: str,
        billing_cycle: str = "monthly",
        plan_name: Optional[str] = None,
        custom_price: Optional[float] = None,
        custom_minutes: Optional[int] = None,
        custom_overage_rate: Optional[float] = None,
        admin_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        sub = await self.get_or_create_subscription(tenant_id)
        
        tier_upper = plan_tier.upper()
        is_yearly = billing_cycle.lower() == "yearly"

        if tier_upper == "CUSTOM":
            final_price = custom_price if custom_price is not None and custom_price >= 0 else 0.0
            base_price = final_price
            discount = 0.0
            included_mins = custom_minutes if custom_minutes is not None and custom_minutes >= 0 else 1000
            overage_rate = custom_overage_rate if custom_overage_rate is not None and custom_overage_rate >= 0 else 7.0
            features = [
                f"{included_mins:,} voice minutes included",
                "Custom Pay-As-You-Go overage rate",
                "Full clinic AI receptionist suite",
                "Free maintenance & priority error handling"
            ]
            assigned_name = plan_name or f"Custom Plan ({'Yearly' if is_yearly else 'Monthly'})"
        else:
            plan_template = PLANS_CATALOG.get(tier_upper, PLANS_CATALOG["STARTER"])
            base_price = plan_template["yearlyPrice"] if is_yearly else plan_template["monthlyPrice"]
            final_price = custom_price if custom_price is not None and custom_price >= 0 else base_price
            discount = max(0.0, base_price - final_price)
            included_mins = custom_minutes if custom_minutes is not None and custom_minutes > 0 else plan_template["includedMinutes"]
            overage_rate = custom_overage_rate if custom_overage_rate is not None and custom_overage_rate >= 0 else plan_template["payAsYouGoRate"]
            features = plan_template["features"]
            assigned_name = plan_name or f"{plan_template['name']} ({'Yearly' if is_yearly else 'Monthly'})"
        
        now = datetime.utcnow()

        sub.planTier = tier_upper
        sub.planName = assigned_name
        sub.billingCycle = "yearly" if is_yearly else "monthly"
        sub.basePrice = base_price
        sub.finalPrice = final_price
        sub.discountAmount = discount
        sub.includedMinutes = included_mins
        sub.payAsYouGoRate = overage_rate
        sub.features = features
        if admin_notes is not None:
            sub.adminNotes = admin_notes
        sub.status = SubscriptionStatus.ACTIVE
        
        # Only initialize startedAt if this is a brand new subscription or currently unset
        if not sub.startedAt:
            sub.startedAt = now
            sub.currentPeriodEnd = now + timedelta(days=365 if is_yearly else 30)
        elif not sub.currentPeriodEnd or sub.currentPeriodEnd < now:
            sub.currentPeriodEnd = now + timedelta(days=365 if is_yearly else 30)

        sub.updatedAt = now

        await self.session.commit()
        await self.session.refresh(sub)

        return await self.get_subscription_with_usage(tenant_id)
