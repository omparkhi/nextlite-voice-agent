import asyncio
import json
import base64
import pytest
from app.main import DiagnosticPlivoFrameSerializer
from pipecat.serializers.plivo import PlivoFrameSerializer


@pytest.mark.asyncio
async def test_dynamic_telephony_jitter_buffer_pacing():
    """Verify DiagnosticPlivoFrameSerializer monitors inbound Plivo media frame deltas and adapts pacing window."""
    params = PlivoFrameSerializer.InputParams(auto_hang_up=False, plivo_sample_rate=8000)
    serializer = DiagnosticPlivoFrameSerializer(stream_id="test_jitter_stream", params=params)

    assert serializer.estimated_jitter_ms == 0.0
    assert serializer.adaptive_pacing_window_ms == 20.0

    # Generate dummy media payload (160 bytes of zero ulaw)
    dummy_payload = base64.b64encode(bytes([0xFF] * 160)).decode("utf-8")
    media_event = json.dumps({
        "event": "media",
        "streamId": "test_jitter_stream",
        "media": {"payload": dummy_payload}
    })

    # Simulate 5 media frames arriving smoothly with ~20ms spacing
    fake_time = 100.0
    for _ in range(5):
        serializer._update_jitter_estimate(fake_time)
        fake_time += 0.020  # exactly 20ms

    assert serializer.estimated_jitter_ms < 5.0
    assert serializer.adaptive_pacing_window_ms == 20.0

    # Simulate severe jitter (delays of 70ms, 5ms, 80ms, 10ms...)
    jitter_delays = [0.070, 0.005, 0.080, 0.010, 0.090, 0.005, 0.075, 0.010, 0.085, 0.005,
                     0.070, 0.005, 0.080, 0.010, 0.090, 0.005, 0.075, 0.010, 0.085, 0.005,
                     0.070, 0.005, 0.080, 0.010, 0.090]
    for delay in jitter_delays:
        fake_time += delay
        serializer._update_jitter_estimate(fake_time)

    assert serializer.estimated_jitter_ms > 35.0
    assert serializer.adaptive_pacing_window_ms == 40.0

    # Simulate network stabilization (25 frames at exact 20ms)
    for _ in range(25):
        fake_time += 0.020
        serializer._update_jitter_estimate(fake_time)

    assert serializer.estimated_jitter_ms < 15.0
    assert serializer.adaptive_pacing_window_ms == 20.0
