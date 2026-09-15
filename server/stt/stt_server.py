"""
Mara's local speech-to-text service.

Runs only on the owner's laptop (RTX 5090), the same machine that already
hosts Ollama and the git execution bridge, and follows the same pattern:
a small local HTTP service, reachable through the Cloudflare Tunnel,
authenticated with a shared bearer token.

Exists specifically because Electron's bundled Chromium ships the Web
Speech Recognition *API* but not the network speech service real Chrome
has credentials for — every recognition attempt in the desktop app fails
immediately with a "network" error (confirmed live). Browser mic capture
via getUserMedia/MediaRecorder still works fine in Electron; only Chrome's
own cloud recognition is missing. This service replaces that missing
piece with a real, local transcription engine (faster-whisper, GPU
accelerated via CTranslate2) — audio in, text out, no cloud dependency.

Run with: whisper-env\\Scripts\\python.exe server\\stt\\stt_server.py
"""
import io
import os
import secrets
import sys
import tempfile

# pip-installed nvidia-cublas-cu12 / nvidia-cudnn-cu12 place their DLLs under
# site-packages/nvidia/*/bin. CTranslate2's CUDA backend delay-loads
# cublas64_12.dll/cudnn64_9.dll on first GPU call (not at import time), and
# MSVC's delay-load helper resolves those through the classic Windows DLL
# search order — which reads the PATH environment variable, but does NOT
# consult directories registered via os.add_dll_directory() (that API only
# affects LoadLibraryEx calls made with the AddDllDirectory search flags,
# which delay-loaded dependencies don't use). Must run before importing
# faster_whisper/ctranslate2.
if sys.platform == "win32":
    import glob

    venv_root = os.path.dirname(os.path.dirname(sys.executable))
    nvidia_root = os.path.join(venv_root, "Lib", "site-packages", "nvidia")
    bin_dirs = glob.glob(os.path.join(nvidia_root, "*", "bin"))
    os.environ["PATH"] = os.pathsep.join(bin_dirs + [os.environ.get("PATH", "")])

from fastapi import FastAPI, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

TOKEN = os.environ.get("MARA_STT_TOKEN")
if not TOKEN or len(TOKEN) < 32:
    print("[stt] MARA_STT_TOKEN is missing or too short — refusing to start.", file=sys.stderr)
    sys.exit(1)

MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16" if DEVICE == "cuda" else "int8")

print(f"[stt] loading model '{MODEL_NAME}' on {DEVICE} ({COMPUTE_TYPE})...", flush=True)
try:
    model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE, download_root=MODEL_DIR)
except Exception as exc:  # GPU/CUDA unavailable — fall back to CPU rather than refuse to start.
    print(f"[stt] GPU load failed ({exc}); falling back to CPU (int8)", flush=True)
    DEVICE = "cpu"
    COMPUTE_TYPE = "int8"
    model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE, download_root=MODEL_DIR)
print(f"[stt] model ready on {DEVICE}", flush=True)

app = FastAPI()

# The Control Center calls this service directly from the browser/Electron
# renderer at https://hellomara.net (not proxied through Railway), which
# makes it a cross-origin request — the Authorization header on it isn't a
# CORS "simple" header, so the browser sends an OPTIONS preflight first.
# Without this middleware FastAPI has no OPTIONS handler at all (confirmed
# live: preflight came back 405), which silently breaks every voice request
# from an actual browser even though direct POSTs (curl, no preflight) work.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://hellomara.net"],
    allow_methods=["POST"],
    allow_headers=["Authorization"],
)


def check_auth(authorization: str | None) -> None:
    expected = f"Bearer {TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(file: UploadFile, authorization: str | None = Header(default=None)):
    check_auth(authorization)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty audio")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="audio too large")

    # faster-whisper reads from a file path or file-like object; the browser
    # sends webm/ogg opus, which ctranslate2's bundled ffmpeg-less decoder
    # (via av) handles directly from bytes — write to a temp file for the
    # widest compatibility across container formats.
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(tmp_path, beam_size=5, vad_filter=True)
        text = "".join(segment.text for segment in segments).strip()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return JSONResponse({"text": text, "language": info.language, "language_probability": info.language_probability})


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("MARA_STT_PORT", "5752"))
    uvicorn.run(app, host="0.0.0.0", port=port)
