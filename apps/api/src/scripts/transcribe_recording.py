import os
import sys
import subprocess
import json
import requests
import imageio_ffmpeg

sys.stdout.reconfigure(encoding='utf-8')

def transcribe():
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    audio_path = r"C:\Users\Vaishnavi\.gemini\antigravity-ide\brain\87c58501-818c-4be2-aa53-1bb13c9ecb14\recording.mp3"
    work_dir = r"C:\Users\Vaishnavi\.gemini\antigravity-ide\brain\87c58501-818c-4be2-aa53-1bb13c9ecb14"

    api_key = "sk_pni81ael_I6fImwOdmPaVR0SRC0zSoHdI"
    env_file = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("SARVAM_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()

    # Split into 15-second chunks
    chunk_duration = 15
    chunks = []
    for i in range(6):
        start_sec = i * chunk_duration
        chunk_path = os.path.join(work_dir, f"seg_{i}.mp3")
        cmd_cut = [
            ffmpeg_exe, "-y",
            "-ss", str(start_sec),
            "-t", str(chunk_duration),
            "-i", audio_path,
            "-acodec", "copy",
            chunk_path
        ]
        subprocess.run(cmd_cut, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.path.exists(chunk_path) and os.path.getsize(chunk_path) > 1000:
            chunks.append((start_sec, chunk_path))

    full_transcript = []
    headers = {"api-subscription-key": api_key}
    url = "https://api.sarvam.ai/speech-to-text"

    for start_sec, chunk_path in chunks:
        with open(chunk_path, "rb") as f:
            files = {"file": (os.path.basename(chunk_path), f, "audio/mp3")}
            data = {"model": "saaras:v3"}
            r = requests.post(url, headers=headers, files=files, data=data)
            resp = r.json()
            if "transcript" in resp and resp["transcript"]:
                text = resp["transcript"].strip()
                if text:
                    full_transcript.append(f"[{start_sec}s - {start_sec+15}s]: {text}")

    output_txt = os.path.join(work_dir, "transcript_recording.txt")
    with open(output_txt, "w", encoding="utf-8") as out_f:
        out_f.write("\n".join(full_transcript))

    print(f"Transcript written to {output_txt}")
    print("\n--- TRANSCRIPT CONTENT ---")
    print("\n".join(full_transcript))

if __name__ == "__main__":
    transcribe()
