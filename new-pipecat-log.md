PS E:\NextLite\nextlite-voice-engineering-spec> & ".\apps\pipecat-worker\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --app-dir apps/pipecat-worker
INFO:     Will watch for changes in these directories: ['E:\\NextLite\\nextlite-voice-engineering-spec']
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [31428] using WatchFiles
2026-09-16 14:03:27.214 | INFO     | pipecat:<module>:54 - ᓚᘏᗢ Pipecat 1.8.1 (Python 3.14.3 (tags/v3.14.3:323c59a, Feb  3 2026, 16:04:56) [MSC v.1944 64 bit (AMD64)]) ᓚᘏᗢ
INFO:     Started server process [23608]
INFO:     Waiting for application startup.
2026-09-16 14:03:28.691 | INFO     | app.main:lifespan:133 - Pipecat Worker starting up (Phase 12: Startup Latency & Authoritative Temporal Grounding)
2026-09-16 14:03:28.691 | INFO     | app.main:lifespan:134 - Configuration: HOST=0.0.0.0, PORT=8000, NEXTLITE_API_URL=http://localhost:3001, STT=saaras:v3-realtime, LLM=sarvam-105b-conversations, TTS=bulbul:v3
2026-09-16 14:03:29.738 | INFO     | app.main:_prewarm_starters_task:184 - [Starter Cache Warming] Pre-warmed 15 phrases for language=mr-IN
2026-09-16 14:03:29.758 | INFO     | app.main:_prewarm_starters_task:184 - [Starter Cache Warming] Pre-warmed 13 phrases for language=hi-IN
2026-09-16 14:03:29.788 | INFO     | app.main:_prewarm_starters_task:184 - [Starter Cache Warming] Pre-warmed 13 phrases for language=en-IN
INFO:     Application startup complete.
2026-09-16 14:03:30.381 | INFO     | app.main:_prewarm_sarvam_llm:161 - [LLM Connection Pool] Pre-warmed TLS keepalive connection to api.sarvam.ai
INFO:     3.7.220.174:0 - "GET /plivo/test-xml?ALegRequestUUID=afa6fa0c-c9c8-4abb-a673-f89f2199cc9b&ALegUUID=afa6fa0c-c9c8-4abb-a673-f89f2199cc9b&BillRate=0.00475&CallStatus=in-progress&CallUUID=afa6fa0c-c9c8-4abb-a673-f89f2199cc9b&ComplianceApplicationId=1c773e5e-fc3e-4bc7-9b3e-8f472cff1374&ComplianceStatus=accepted&CountryCode=IN&Direction=outbound&Event=StartApp&From=918031791051&ParentAuthID=MAMGE2MZAWM2ITY2QYMC&RequestUUID=afa6fa0c-c9c8-4abb-a673-f89f2199cc9b&RouteType=Domestic_Anchored&STIRAttestation=Not+Applicable&STIRVerification=Not+Applicable&SessionStart=2026-09-16+08%3A33%3A39.219903&To=919657954641&deploymentId=6bed252c-c1f7-4886-b152-0f8e16fa3a10&direction=outbound&to=%2B919657954641 HTTP/1.1" 200 OK
2026-09-16 14:03:47.904 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] websocket_handler_entered: 0ms from start
2026-09-16 14:03:47.904 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] call_start: 0ms from start
INFO:     3.7.4.233:0 - "WebSocket /ws/plivo?deploymentId=6bed252c-c1f7-4886-b152-0f8e16fa3a10&direction=outbound&from=918031791051&to=919657954641&callId=afa6fa0c-c9c8-4abb-a673-f89f2199cc9b" [accepted]
INFO:     connection open
2026-09-16 14:03:47.906 | INFO     | app.main:websocket_plivo_endpoint:1819 - Plivo WebSocket connected from Address(host='3.7.4.233', port=0)
2026-09-16 14:03:47.907 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] websocket_accepted: 3ms from start
2026-09-16 14:03:47.908 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] websocket_waiting_first_msg: 4ms from start
2026-09-16 14:03:48.021 | INFO     | app.main:websocket_plivo_endpoint:2008 - Received initial Plivo event: 'start'
2026-09-16 14:03:48.021 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] plivo_start_received: 117ms from start
2026-09-16 14:03:48.022 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] start_frame_received: 117ms from start
2026-09-16 14:03:48.022 | INFO     | app.main:websocket_plivo_endpoint:2018 - Plivo stream started | stream_id=04c71000-dcdc-4865-80ca-b6fb84b54a3d | call_id=afa6fa0c-c9c8-4abb-a673-f89f2199cc9b | mediaFormat={'encoding': 'audio/x-l16', 'sampleRate': 8000}
2026-09-16 14:03:48.022 | INFO     | app.main:websocket_plivo_endpoint:2051 - [Plivo MediaFormat] encoding=audio/x-l16 | sampleRate=8000
2026-09-16 14:03:48.023 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] deployment_id_resolved: 119ms from start
2026-09-16 14:03:48.023 | INFO     | app.main:websocket_plivo_endpoint:2065 - Resolved authoritative deploymentId=6bed252c-c1f7-4886-b152-0f8e16fa3a10 for stream_id=04c71000-dcdc-4865-80ca-b6fb84b54a3d
2026-09-16 14:03:48.023 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] runtime_config_start: 120ms from start
2026-09-16 14:03:48.024 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] runtime_config_request_start: 120ms from start
2026-09-16 14:03:48.316 | INFO     | app.runtime_config_client:get_runtime_agent_config:445 - Successfully resolved RuntimeAgentConfig | tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 | agentId=d04b7889-223a-45c8-bde5-8717cc435302 | deploymentId=6bed252c-c1f7-4886-b152-0f8e16fa3a10 | versionNumber=32
2026-09-16 14:03:48.316 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] runtime_config_resolved: 412ms from start
2026-09-16 14:03:48.316 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] runtime_config_response: 412ms from start
2026-09-16 14:03:48.316 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] temporal_context_start: 413ms from start
2026-09-16 14:03:48.324 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] temporal_context_ready: 421ms from start
2026-09-16 14:03:48.325 | INFO     | app.main:websocket_plivo_endpoint:2138 - [TEMPORAL_CONTEXT] {"timezone":"Asia/Kolkata","currentDate":"Wednesday, September 16, 2026","currentTime":"2:03 PM","dayOfWeek":"Wednesday"}
2026-09-16 14:03:48.332 | INFO     | app.greeting_cache:get:123 - [GreetingCache] Loaded cached greeting from disk (15 chunks, key=f70f361c3c85...)
2026-09-16 14:03:48.333 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] tts_service_create_start: 429ms from start
2026-09-16 14:03:48.333 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] tts_service_created: 430ms from start
2026-09-16 14:03:48.334 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] greeting_queue_start: 430ms from start
2026-09-16 14:03:48.334 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] greeting_queued: 430ms from start
2026-09-16 14:03:48.334 | INFO     | app.turn_timing:record_event:690 - [PIPECAT_TURN_TRACE] {"call_id":"04c71000-dcdc-4865-80ca-b6fb84b54a3d","turn_id":"turn-47a2eff2","sequence":1,"event":"greeting_start","timestamp":"2026-09-16T08:33:48.334834+00:00","monotonicTimestamp":278310.827211,"elapsedFromCallStartMs":428}
2026-09-16 14:03:48.335 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] call_session_start: 431ms from start
2026-09-16 14:03:48.335 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] call_session_request_start: 431ms from start
2026-09-16 14:03:48.336 | INFO     | app.main:_play_cached_greeting_directly:2401 - [GreetingFastPath] Direct Plivo playback started for stream_id=04c71000-dcdc-4865-80ca-b6fb84b54a3d (15 chunks, key=f70f361c3c...)
2026-09-16 14:03:48.337 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] greeting_first_audio_sent_to_plivo: 433ms from start
2026-09-16 14:03:48.337 | INFO     | app.main:serialize:1788 - [AudioOutput Boundary O (Plivo Serializer)] First outbound audio frame serialized & sent to Plivo | bytes=6020
2026-09-16 14:03:48.338 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] greeting_tts_started: 432ms from start
2026-09-16 14:03:48.338 | INFO     | app.turn_timing:record_event:690 - [PIPECAT_TURN_TRACE] {"call_id":"04c71000-dcdc-4865-80ca-b6fb84b54a3d","turn_id":"turn-47a2eff2","sequence":2,"event":"greeting_tts_started","timestamp":"2026-09-16T08:33:48.338481+00:00","monotonicTimestamp":278310.829045,"elapsedFromCallStartMs":430}
2026-09-16 14:03:48.338 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] greeting_first_audio: 432ms from start
2026-09-16 14:03:48.339 | INFO     | app.turn_timing:record_event:690 - [PIPECAT_TURN_TRACE] {"call_id":"04c71000-dcdc-4865-80ca-b6fb84b54a3d","turn_id":"turn-47a2eff2","sequence":3,"event":"greeting_first_audio","timestamp":"2026-09-16T08:33:48.339049+00:00","monotonicTimestamp":278310.829045,"elapsedFromCallStartMs":430}
2026-09-16 14:03:48.344 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] stt_service_create_start: 440ms from start
2026-09-16 14:03:48.345 | INFO     | app.main:websocket_plivo_endpoint:2492 - [SarvamRealtimeSTT Config] Initializing SarvamRealtimeSTTService | model=saaras:v3-realtime | stream_type=fast | sample_rate=8000 | language=mr-IN
2026-09-16 14:03:48.347 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] stt_service_created: 443ms from start
2026-09-16 14:03:48.347 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] tool_registry_start: 444ms from start
2026-09-16 14:03:48.348 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] tool_registry_resolved: 444ms from start
2026-09-16 14:03:48.348 | INFO     | app.main:websocket_plivo_endpoint:2537 - [ToolRegistry] Resolved 5 native Pipecat tools: ['query_knowledge_base', 'book_appointment', 'create_callback_lead', 'check_available_slots', 'reschedule_appointment']
2026-09-16 14:03:48.349 | INFO     | app.main:set_greeting_active:1589 - [StartupGate] State transitioned to GREETING (suppressing pre-greeting line noise)
2026-09-16 14:03:48.350 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] llm_service_create_start: 446ms from start
2026-09-16 14:03:48.350 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] llm_service_created: 446ms from start
2026-09-16 14:03:48.351 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] pipeline_construct_start: 447ms from start
2026-09-16 14:03:48.351 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] pipeline_created: 447ms from start
2026-09-16 14:03:48.352 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] pipeline_start: 448ms from start
2026-09-16 14:03:48.352 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] tts_connection_start: 448ms from start
2026-09-16 14:03:48.352 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] pipeline_started: 448ms from start
2026-09-16 14:03:48.352 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] pipeline_runner_started: 448ms from start
2026-09-16 14:03:48.352 | INFO     | app.main:websocket_plivo_endpoint:2814 - Starting Pipecat Conversational Voice Pipeline for stream_id=04c71000-dcdc-4865-80ca-b6fb84b54a3d | callSessionId=none | tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 | agentId=d04b7889-223a-45c8-bde5-8717cc435302 | deploymentId=6bed252c-c1f7-4886-b152-0f8e16fa3a10 | voiceId=shubh | stt=saaras:v3-realtime | llm=sarvam-105b-conversations | tts=bulbul:v3 | timezone=Asia/Kolkata | greeting=yes | setup time: 0.446s
2026-09-16 14:03:49.519 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] call_session_created: 1615ms from start
2026-09-16 14:03:49.520 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] call_session_resolved: 1617ms from start
2026-09-16 14:03:49.523 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] call_session_response: 1619ms from start
2026-09-16 14:03:49.523 | INFO     | app.main:_bg_create_call_session:2224 - [CallSession] Created ACTIVE session id=2f6e83b6-24d0-4a60-bcaa-1feca6223489 in background | tenantId=6b4b6128-5b5f-4d2f-b5de-91511ab9b120 | agentId=d04b7889-223a-45c8-bde5-8717cc435302 | direction=OUTBOUND | caller=+919657954641
2026-09-16 14:03:49.859 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] stt_ready: 1955ms from start
2026-09-16 14:03:49.859 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] stt_connected: 1955ms from start
2026-09-16 14:03:49.859 | INFO     | app.main:on_stt_connected:2513 - [SarvamRealtimeSTT] WebSocket connected successfully (elapsed: 1.953s)
2026-09-16 14:03:49.906 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] tts_ready: 2002ms from start
2026-09-16 14:03:49.906 | INFO     | app.turn_timing:record_event:690 - [PIPECAT_TURN_TRACE] {"call_id":"04c71000-dcdc-4865-80ca-b6fb84b54a3d","turn_id":"turn-47a2eff2","sequence":4,"event":"tts_connected","timestamp":"2026-09-16T08:33:49.906822+00:00","monotonicTimestamp":278312.398823,"elapsedFromCallStartMs":2000}
2026-09-16 14:03:49.907 | INFO     | app.main:on_tts_connected:2320 - Sarvam TTS WebSocket connected (startup ready at 2.000s)
2026-09-16 14:03:49.912 | INFO     | pipecat.services.sarvam.stt:_handle_message:1234 - SarvamRealtimeSTTService#0 Sarvam realtime session.begin request_id=20260916_e959a073-4aa7-45ff-a653-937c13264918
2026-09-16 14:03:50.002 | INFO     | app.main:_warm_llm_prompt_kv_cache:2672 - [LLM KV Warmup] Successfully preloaded system prompt into Sarvam GPU VRAM cache during greeting
2026-09-16 14:03:50.203 | INFO     | app.main:deserialize:1753 - [AudioInput Boundary A (Plivo Serializer)] InputAudioRawFrame #1 | encoding=audio/x-l16 | sample_rate=8000 | channels=1 | bytes=320 | rms=0.0 | peak=0 | nonzero_ratio=0.0
2026-09-16 14:03:50.205 | INFO     | app.main:process_frame:1611 - [PreSTT Boundary B] Audio frame #1 | state=GREETING | sample_rate=8000 | channels=1 | bytes=320 | rms=0.0 | peak=0 | nonzero_ratio=0.0
2026-09-16 14:03:53.708 | INFO     | app.turn_timing:record_stage:1263 - [CALL_STARTUP_EVENT] greeting_completed: 5804ms from start
2026-09-16 14:03:53.711 | INFO     | app.turn_timing:record_event:690 - [PIPECAT_TURN_TRACE] {"call_id":"04c71000-dcdc-4865-80ca-b6fb84b54a3d","turn_id":"turn-47a2eff2","sequence":5,"event":"greeting_completed","timestamp":"2026-09-16T08:33:53.711095+00:00","monotonicTimestamp":278316.20097,"elapsedFromCallStartMs":5802}
2026-09-16 14:03:53.713 | INFO     | app.main:set_ready_for_user:1599 - [StartupGate] State transitioned to READY_FOR_USER (gate open for bidirectional conversation)
2026-09-16 14:03:53.720 | INFO     | app.main:process_frame:1192 - [Trace A] First InputAudioRawFrame reached pipeline timing_monitor
2026-09-16 14:03:55.732 | INFO     | app.main:on_client_disconnected:2482 - [Plivo Transport] WebSocket client disconnected event triggered for stream_id=04c71000-dcdc-4865-80ca-b6fb84b54a3d
2026-09-16 14:03:55.733 | INFO     | app.turn_timing:emit_call_baseline_summary:1125 - [P0_FORENSIC_CALL_SUMMARY] {"sessionId":"2f6e83b6-24d0-4a60-bcaa-1feca6223489","totalTurns":0,"successfulTurns":0,"interruptedTurns":0,"toolTurns":0,"normalTurns":0,"totalCallDurationMs":7826,"waterfall":{"speechStopToLlmFirstContent":{"p50":null,"p90":null,"p95":null,"max":null},"llmFirstContentToTextRelease":{"p50":null,"p90":null,"p95":null,"max":null},"textReleaseToTTSSend":{"p50":null,"p90":null,"p95":null,"max":null},"ttsSendToFirstServerMessage":{"p50":null,"p90":null,"p95":null,"max":null},"firstServerMessageToFirstAudio":{"p50":null,"p90":null,"p95":null,"max":null},"firstAudioToPlivo":{"p50":null,"p90":null,"p95":null,"max":null},"speechStopToPlivoFirstAudio":{"p50":null,"p90":null,"p95":null,"max":null}},"ttsConnection":{"readyPercentage":100.0,"reconnectPercentage":0.0,"sendToFirstAudioAvgMs":null,"sendToFirstAudioP50Ms":null,"sendToFirstAudioP90Ms":null,"sendToFirstAudioP95Ms":null,"sendToFirstAudioMaxMs":null}}
2026-09-16 14:03:56.037 | INFO     | app.main:finalize_call_session:1986 - [CallSession] Finalized session 2f6e83b6-24d0-4a60-bcaa-1feca6223489 with status=COMPLETED | duration=8s (7826ms) | turns=1 | tools=[]
2026-09-16 14:03:56.203 | INFO     | app.main:websocket_plivo_endpoint:3000 - Plivo WebSocket session finished | stream_id=04c71000-dcdc-4865-80ca-b6fb84b54a3d | duration=8.30s
INFO:     3.7.4.233:0 - "POST /plivo/test-xml?deploymentId=6bed252c-c1f7-4886-b152-0f8e16fa3a10&direction=outbound&to=%2B919657954641 HTTP/1.1" 200 OK
