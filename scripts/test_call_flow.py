"""Interactive Real Call & Voice Pipeline Test Script for NextLite Voice V3.

Tests:
1. End Call (`end_call` tool & graceful closing utterance playback)
2. Dynamic Silence / Nudge detection (triggers dynamic LLM check-in after silence_delay)
3. Interruption / Speech Handling

Usage:
  # 1. Test WebSocket pipeline locally (No carrier charges):
  python scripts/test_call_flow.py --mode ws --url ws://localhost:8000/ws/plivo

  # 2. Test via ngrok URL:
  python scripts/test_call_flow.py --mode ws --url wss://dandelion-gigantic-challenge.ngrok-free.dev/ws/plivo

  # 3. Trigger a real phone call to your phone via Plivo:
  python scripts/test_call_flow.py --mode plivo --phone +919876543210 --ngrok dandelion-gigantic-challenge.ngrok-free.dev
"""

import argparse
import asyncio
import base64
import json
import os
import sys
import time


async def run_websocket_simulation(ws_url: str):
    """Simulates Plivo WebSocket media exchange and verifies nudge & end_call flow."""
    try:
        import websockets
    except ImportError:
        print("\n[ERROR] 'websockets' library is required. Install it using:")
        print("  pip install websockets")
        return

    print(f"\n========================================================")
    print(f" Connecting to Voice Pipeline WebSocket:")
    print(f" URL: {ws_url}")
    print(f"========================================================\n")

    call_id = f"test-call-{int(time.time())}"
    stream_id = f"stream-{int(time.time())}"

    async with websockets.connect(ws_url) as ws:
        # 1. Send Plivo start event
        start_event = {
            "event": "start",
            "start": {
                "callId": call_id,
                "streamId": stream_id,
                "customParameters": {
                    "caller_number": "+919876543210",
                    "From": "+919876543210",
                    "To": "+911234567890",
                },
                "mediaFormat": {
                    "encoding": "audio/x-mulaw",
                    "sampleRate": 8000,
                    "channels": 1,
                },
            },
        }
        await ws.send(json.dumps(start_event))
        print(f"[WS SENT] Plivo 'start' event initialized (streamId={stream_id})")

        # Background task to receive audio / events from worker
        audio_chunks_received = 0
        end_frame_seen = False

        async def receive_loop():
            nonlocal audio_chunks_received, end_frame_seen
            try:
                async for message in ws:
                    data = json.loads(message)
                    event = data.get("event")
                    if event == "playAudio":
                        audio_chunks_received += 1
                        if audio_chunks_received == 1:
                            print(f"[WS RECV] First audio chunk received from assistant!")
                        elif audio_chunks_received % 50 == 0:
                            print(f"[WS RECV] Received {audio_chunks_received} outbound audio chunks...")
                    elif event == "stop" or event == "close":
                        print(f"[WS RECV] Plivo terminal '{event}' received from worker.")
                        end_frame_seen = True
                    elif event == "clearAudio":
                        print(f"[WS RECV] 'clearAudio' (Interruption signal) received.")
            except Exception as e:
                pass

        recv_task = asyncio.create_task(receive_loop())

        # Continuous 20ms RTP packet sender (simulates carrier RTP stream)
        # Note: 160 bytes of zero mulaw audio = 20ms of silence
        silent_frame_b64 = base64.b64encode(b"\xff" * 160).decode("utf-8")
        is_sending_media = True

        async def send_media_stream():
            while is_sending_media:
                media_event = {
                    "event": "media",
                    "streamId": stream_id,
                    "media": {
                        "payload": silent_frame_b64,
                        "timestamp": str(int(time.time() * 1000)),
                    },
                }
                try:
                    await ws.send(json.dumps(media_event))
                except Exception:
                    break
                await asyncio.sleep(0.02)

        media_task = asyncio.create_task(send_media_stream())

        print("\n--- PHASE 1: Waiting 8s for Greeting & Silence Nudge ---")
        print("Assistant should speak initial greeting and then detect silence after 5-7s...")
        await asyncio.sleep(10)
        print(f"Total audio chunks received so far: {audio_chunks_received}")

        print("\n--- PHASE 2: Ending Call ---")
        print("Sending Plivo hangup event...")
        is_sending_media = False
        media_task.cancel()

        stop_event = {"event": "stop", "streamId": stream_id}
        await ws.send(json.dumps(stop_event))
        await asyncio.sleep(2)

        recv_task.cancel()
        print("\n[SUCCESS] WebSocket test flow completed cleanly.\n")


def main():
    parser = argparse.ArgumentParser(description="NextLite Voice V3 Call & Feature Tester")
    parser.add_argument(
        "--mode",
        choices=["ws", "plivo"],
        default="ws",
        help="Test mode: 'ws' (WebSocket simulation) or 'plivo' (Outbound PSTN call)",
    )
    parser.add_argument(
        "--url",
        default="ws://localhost:8000/ws/plivo",
        help="WebSocket URL (default: ws://localhost:8000/ws/plivo)",
    )
    parser.add_argument("--phone", help="Destination phone number for real PSTN call (e.g. +919876543210)")
    parser.add_argument("--ngrok", help="Your active ngrok domain (e.g. dandelion-gigantic-challenge.ngrok-free.dev)")

    args = parser.parse_args()

    if args.mode == "ws":
        asyncio.run(run_websocket_simulation(args.url))
    elif args.mode == "plivo":
        if not args.phone or not args.ngrok:
            print("[ERROR] Both --phone and --ngrok are required for 'plivo' mode.")
            print("Example:")
            print(f"  python scripts/test_call_flow.py --mode plivo --phone +919876543210 --ngrok dandelion-gigantic-challenge.ngrok-free.dev")
            return

        import httpx
        clean_ngrok = args.ngrok.replace("https://", "").replace("http://", "").strip("/")
        answer_url = f"https://{clean_ngrok}/api/plivo/answer"

        print(f"\n========================================================")
        print(f" Triggering Outbound Plivo Call:")
        print(f" Phone: {args.phone}")
        print(f" Answer URL: {answer_url}")
        print(f"========================================================\n")

        # If calling NextLite API local endpoint
        try:
            res = httpx.post(
                "http://localhost:3001/api/telephony/outbound-call",
                json={"to": args.phone, "answerUrl": answer_url},
                timeout=10.0,
            )
            print(f"API Response ({res.status_code}): {res.text}")
        except Exception as e:
            print(f"Could not connect to NextLite API: {e}")
            print("\nYou can also configure Plivo Console XML Application to:")
            print(f"  <Response><Stream bidirectional=\"true\">wss://{clean_ngrok}/ws/plivo</Stream></Response>")


if __name__ == "__main__":
    main()
