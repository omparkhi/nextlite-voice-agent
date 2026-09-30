import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Request, Response, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from ..logging import logger
from ..db import get_db
from ..models import CallSession, CallRecording, RecordingStatus

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

async def extract_webhook_payload(request: Request) -> Dict[str, Any]:
    """Safely extracts payload from form data, JSON, or query parameters."""
    payload: Dict[str, Any] = dict(request.query_params)
    
    # Try form data
    try:
        form = await request.form()
        for k, v in form.items():
            payload[k] = v
    except Exception:
        pass

    # Try JSON if payload is still sparse
    try:
        body = await request.json()
        if isinstance(body, dict):
            for k, v in body.items():
                payload[k] = v
    except Exception:
        pass

    return payload


async def reconcile_unmatched_recording(
    session: AsyncSession,
    call_session: CallSession
) -> Optional[CallRecording]:
    """
    Safely reconciles an unmatched CallRecording when its exact CallSession becomes available.
    Strictly keys on CallSession.plivo_call_uuid == CallRecording.plivo_call_uuid.
    """
    if not call_session.plivoCallUuid:
        return None

    clean_uuid = str(call_session.plivoCallUuid).strip()
    stmt = (
        select(CallRecording)
        .where(
            CallRecording.plivoCallUuid == clean_uuid,
            CallRecording.callSessionId.is_(None)
        )
    )
    res = await session.execute(stmt)
    unmatched_rec = res.scalar_one_or_none()

    if unmatched_rec:
        unmatched_rec.callSessionId = call_session.id
        unmatched_rec.tenantId = call_session.tenantId
        unmatched_rec.status = RecordingStatus.AVAILABLE
        unmatched_rec.updatedAt = datetime.utcnow()
        await session.commit()
        logger.info(
            f"[Recording Reconciliation] Successfully reconciled recording {unmatched_rec.plivoRecordingId} "
            f"to CallSession {call_session.id} (tenant={call_session.tenantId}) via exact plivo_call_uuid={clean_uuid}"
        )
        return unmatched_rec

    return None


@router.api_route("/plivo/recordings", methods=["GET", "POST"])
@router.api_route("/telephony/plivo/recordings", methods=["GET", "POST"])
async def plivo_recording_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db)
):
    """
    Authoritative Plivo Recording Webhook Receiver.
    
    Invariant:
    Correlates recording strictly by Plivo CallUUID -> CallSession.plivo_call_uuid.
    Never correlates by phone number, timestamp, or heuristics.
    If no matching CallSession exists, persists safely as UNMATCHED for later reconciliation.
    """
    payload = await extract_webhook_payload(request)
    logger.info(f"[Recording Webhook] Received Plivo callback: {payload}")

    # Extract Plivo fields
    raw_call_uuid = (
        payload.get("CallUUID")
        or payload.get("call_uuid")
        or payload.get("callId")
        or payload.get("call_id")
        or payload.get("ALegUUID")
    )
    raw_recording_id = (
        payload.get("RecordingID")
        or payload.get("recording_id")
        or payload.get("recordingId")
        or payload.get("record_id")
    )
    raw_recording_url = (
        payload.get("RecordUrl")
        or payload.get("recording_url")
        or payload.get("record_url")
        or payload.get("url")
    )
    raw_duration = (
        payload.get("RecordingDuration")
        or payload.get("recording_duration")
        or payload.get("duration")
        or payload.get("Duration")
    )
    raw_format = (
        payload.get("RecordingFormat")
        or payload.get("recording_format")
        or payload.get("format")
        or "mp3"
    )

    clean_call_uuid = str(raw_call_uuid).strip() if raw_call_uuid else None
    clean_recording_id = str(raw_recording_id).strip() if raw_recording_id else None
    clean_recording_url = str(raw_recording_url).strip() if raw_recording_url else ""
    
    duration_secs = 0
    if raw_duration:
        try:
            duration_secs = int(float(str(raw_duration).strip()))
        except (ValueError, TypeError):
            duration_secs = 0

    if not clean_recording_id or not clean_call_uuid:
        logger.warning(
            f"[Recording Webhook] Rejected malformed callback missing required identifiers: "
            f"call_uuid={clean_call_uuid}, recording_id={clean_recording_id}"
        )
        return {
            "status": "ignored",
            "message": "Missing required call_uuid or recording_id",
            "call_uuid": clean_call_uuid,
            "recording_id": clean_recording_id
        }

    # 1. Check for duplicate recording ID (Idempotency - Phase 8)
    existing_stmt = select(CallRecording).where(CallRecording.plivoRecordingId == clean_recording_id)
    existing_res = await session.execute(existing_stmt)
    existing_rec = existing_res.scalar_one_or_none()

    if existing_rec:
        logger.info(f"[Recording Webhook] Idempotent hit: Recording {clean_recording_id} already exists")
        # If existing record was UNMATCHED, attempt reconciliation now
        if existing_rec.callSessionId is None:
            cs_stmt = select(CallSession).where(CallSession.plivoCallUuid == clean_call_uuid)
            cs_res = await session.execute(cs_stmt)
            matched_cs = cs_res.scalar_one_or_none()
            if matched_cs:
                existing_rec.callSessionId = matched_cs.id
                existing_rec.tenantId = matched_cs.tenantId
                existing_rec.status = RecordingStatus.AVAILABLE
                existing_rec.updatedAt = datetime.utcnow()
                await session.commit()
                logger.info(
                    f"[Recording Webhook] Attached previously UNMATCHED recording {clean_recording_id} "
                    f"to CallSession {matched_cs.id}"
                )
        if clean_recording_url and not existing_rec.recordingUrl:
            existing_rec.recordingUrl = clean_recording_url
        if duration_secs > 0:
            existing_rec.durationSeconds = duration_secs
        await session.commit()
        return {
            "status": "success",
            "recordingId": str(existing_rec.id),
            "recordingStatus": existing_rec.status.value,
            "callSessionId": str(existing_rec.callSessionId) if existing_rec.callSessionId else None
        }

    # 2. Find exact CallSession by plivo_call_uuid (Phase 6)
    cs_stmt = select(CallSession).where(CallSession.plivoCallUuid == clean_call_uuid)
    cs_res = await session.execute(cs_stmt)
    call_session = cs_res.scalar_one_or_none()

    now = datetime.utcnow()
    if call_session:
        # Exact match found: attach recording directly
        new_rec = CallRecording(
            id=uuid.uuid4(),
            tenantId=call_session.tenantId,
            callSessionId=call_session.id,
            plivoCallUuid=clean_call_uuid,
            plivoRecordingId=clean_recording_id,
            recordingUrl=clean_recording_url,
            recordingFormat=raw_format.lower(),
            durationSeconds=duration_secs,
            status=RecordingStatus.AVAILABLE,
            metadataJson=payload,
            createdAt=now,
            updatedAt=now
        )
        session.add(new_rec)
        await session.commit()
        logger.info(
            f"[Recording Webhook] Created & attached CallRecording {new_rec.id} (Plivo REC={clean_recording_id}) "
            f"to CallSession {call_session.id} (tenant={call_session.tenantId}) for plivo_call_uuid={clean_call_uuid}"
        )
        return {
            "status": "attached",
            "recordingId": str(new_rec.id),
            "callSessionId": str(call_session.id),
            "recordingStatus": "AVAILABLE"
        }
    else:
        # No CallSession found yet: store as UNMATCHED (Phase 6 Failure Case)
        new_rec = CallRecording(
            id=uuid.uuid4(),
            tenantId=None,
            callSessionId=None,
            plivoCallUuid=clean_call_uuid,
            plivoRecordingId=clean_recording_id,
            recordingUrl=clean_recording_url,
            recordingFormat=raw_format.lower(),
            durationSeconds=duration_secs,
            status=RecordingStatus.UNMATCHED,
            metadataJson=payload,
            createdAt=now,
            updatedAt=now
        )
        session.add(new_rec)
        await session.commit()
        logger.warning(
            f"[Recording Webhook] No matching CallSession found for plivo_call_uuid={clean_call_uuid}. "
            f"Stored CallRecording {new_rec.id} (Plivo REC={clean_recording_id}) as UNMATCHED."
        )
        return {
            "status": "unmatched",
            "recordingId": str(new_rec.id),
            "recordingStatus": "UNMATCHED"
        }
