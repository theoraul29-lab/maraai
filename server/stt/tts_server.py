"""
Mara's local text-to-speech service.

Runs only on the owner's laptop, alongside stt_server.py (same directory,
same pattern): a small local HTTP service, reached directly from the
browser through a Cloudflare Tunnel, authenticated with a shared bearer
token. See stt_server.py's module docstring for why these services live
on the laptop rather than behind Railway (cross-origin, not proxied).

Exists because the previous voice path — the browser's native
window.speechSynthesis (Web Speech API / OS SAPI voices) — sounds
robotic and was the whole reason for this module: Mara's Control Center
needed a warm, natural, "JARVIS"-style voice instead. This service wraps
edge-tts (MIT-licensed, calls Microsoft Edge's free neural voice
synthesis endpoint — no API key, no per-character billing) and exposes
an endpoint that takes text (+ optional language hint and male/female
voice-style choice) and returns ready-to-play MP3 bytes synthesized with
a native neural voice for the detected/requested language, plus a
/voices catalogue endpoint the Control Center's voice picker reads to
know what's available.

Run with: whisper-env\\Scripts\\python.exe server\\stt\\tts_server.py
"""
import asyncio
import os
import re
import secrets
import sys

import edge_tts
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from langdetect import DetectorFactory, detect
from langdetect.lang_detect_exception import LangDetectException

# Deterministic detection (langdetect's n-gram classifier is otherwise
# seeded from wall-clock time, which makes short/ambiguous strings flip
# between runs for no reason).
DetectorFactory.seed = 0

TOKEN = os.environ.get("MARA_TTS_TOKEN")
if not TOKEN or len(TOKEN) < 32:
    print("[tts] MARA_TTS_TOKEN is missing or too short — refusing to start.", file=sys.stderr)
    sys.exit(1)

# Language -> {male, female} native neural voice. Picked for a warm delivery
# over a chipper/cheerful/news-anchor one — edge-tts's own catalogue tags
# each voice's style, used as the selection signal for both sets (same bar
# applied to the male voices originally):
#   ro male:   ro-RO-EmilNeural   — "Friendly, Positive"; only male RO option
#   ro female: ro-RO-AlinaNeural  — "Friendly, Positive"; only female RO option
#              (edge-tts's RO catalogue is just these two — no further choice)
#   en male:   en-US-AndrewNeural — "Warm, Confident, Authentic, Honest"
#   en female: en-US-JennyNeural  — "Friendly, Considerate, Comfort" — chosen
#              over en-US-AriaNeural ("Positive, Confident", a news-anchor
#              read) and the *Neural "Cheerful"-tagged voices (AnaNeural is
#              cartoon-cute, EmmaNeural leans upbeat) precisely because
#              "Comfort" is the closest tag to the warm/JARVIS bar; Ava
#              ("Expressive, Caring, Pleasant, Friendly") was the runner-up
#   de male:   de-DE-ConradNeural — "Friendly, Positive"
#   de female: de-DE-KatjaNeural  — "Friendly, Positive"; the long-established
#              default DE neural voice, natural and even-toned
# Easy for a human to swap later: just change the voice name and restart
# the service, no other code changes needed.
LANG_VOICE_MAP: dict[str, dict[str, str]] = {
    "ro": {"male": "ro-RO-EmilNeural", "female": "ro-RO-AlinaNeural"},
    "en": {"male": "en-US-AndrewNeural", "female": "en-US-JennyNeural"},
    "de": {"male": "de-DE-ConradNeural", "female": "de-DE-KatjaNeural"},
}
DEFAULT_LANG = "en"
DEFAULT_STYLE = "male"
VOICE_STYLES = ("male", "female")

app = FastAPI()

# Same reasoning as stt_server.py: the Control Center calls this directly
# from the browser at https://hellomara.net, cross-origin, with an
# Authorization header — the browser preflights that with OPTIONS, which
# FastAPI has no handler for by default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://hellomara.net"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


def check_auth(authorization: str | None) -> None:
    expected = f"Bearer {TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


# Language detection, layered from cheapest/most-certain to broadest, since
# no single method covers both "one-word reply" and "full paragraph" well:
#
#  1. Diacritics — ă/â/î/ș/ț only occur in Romanian, ä/ö/ü/ß only in German
#     among the languages we support, so a hit is treated as certain.
#  2. langdetect (a pure-Python port of Google's n-gram language-detection
#     library, already MIT/Apache-licensed and installed alongside
#     edge-tts) — very reliable on real sentences (verified locally: 8/8 on
#     realistic assistant-reply-length RO/EN/DE samples) but shaky on very
#     short strings, so it's only trusted when it lands on one of our three
#     supported languages; anything else (it knows ~55) is treated as
#     inconclusive and falls through.
#  3. A handful of common stopwords, for short replies too brief for #2.
#  4. An explicit `lang` hint from the caller (e.g. the admin's UI locale).
#  5. English, as the final default.
_RO_DIACRITICS = re.compile(r"[ăâîșț]", re.IGNORECASE)
_DE_DIACRITICS = re.compile(r"[äöüß]", re.IGNORECASE)
_WORD_RE = re.compile(r"[a-zA-ZăâîșțîĂÂÎȘȚäöüßÄÖÜ]+")

_RO_WORDS = {
    "și", "este", "pentru", "sunt", "avem", "să", "cu", "nu", "ce", "care", "din", "la", "un", "o", "am", "te", "mă",
    "buna", "bună", "salut", "acum", "aici", "multumesc", "mulțumesc", "toate", "totul", "azi", "astazi",
}
_DE_WORDS = {
    "und", "ist", "der", "die", "das", "nicht", "ich", "wir", "sie", "mit", "für", "auch", "sehr", "ein", "eine", "du",
    "hallo", "guten", "wie", "kann", "bitte", "heute", "hier", "jetzt", "alles", "keine", "gibt", "alle", "danke",
}
_EN_WORDS = {
    "the", "and", "is", "are", "you", "this", "that", "with", "for", "not", "have", "was", "it's",
    "hello", "please", "today", "here", "now", "all", "system", "systems", "everything", "thanks", "yes",
}


def detect_lang(text: str, hint: str | None) -> str:
    if _RO_DIACRITICS.search(text):
        return "ro"
    if _DE_DIACRITICS.search(text):
        return "de"

    if len(text) >= 12:
        try:
            guess = detect(text)
            if guess in LANG_VOICE_MAP:
                return guess
        except LangDetectException:
            pass

    tokens = {w.lower() for w in _WORD_RE.findall(text)}
    scores = {
        "ro": len(tokens & _RO_WORDS),
        "de": len(tokens & _DE_WORDS),
        "en": len(tokens & _EN_WORDS),
    }
    best_lang = max(scores, key=lambda k: scores[k])
    if scores[best_lang] > 0:
        return best_lang

    normalized_hint = (hint or "").split("-")[0].lower()
    if normalized_hint in LANG_VOICE_MAP:
        return normalized_hint

    return DEFAULT_LANG


@app.get("/health")
def health():
    return {"status": "ok", "voices": LANG_VOICE_MAP}


# Unauthenticated on purpose, same as /health: it's just a static catalogue
# of voice names, nothing sensitive — and the frontend voice picker needs to
# read it before it necessarily has anywhere to send a token from (it's
# fetched alongside the tts-config bootstrap in useMaraCore.ts). Single
# source of truth for the frontend picker, so the two never drift apart.
@app.get("/voices")
def voices():
    return {"languages": LANG_VOICE_MAP, "styles": list(VOICE_STYLES), "defaultStyle": DEFAULT_STYLE}


@app.post("/synthesize")
async def synthesize(body: dict, authorization: str | None = Header(default=None)):
    check_auth(authorization)

    text = body.get("text")
    if not text or not isinstance(text, str):
        raise HTTPException(status_code=400, detail="text is required")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="text too long")

    explicit_voice = body.get("voice")
    if explicit_voice and isinstance(explicit_voice, str):
        voice = explicit_voice
    else:
        style = body.get("voiceStyle") if isinstance(body.get("voiceStyle"), str) else None
        if style not in VOICE_STYLES:
            style = DEFAULT_STYLE  # unset or invalid — keep pre-picker callers behaving exactly as before
        lang = detect_lang(text, body.get("lang") if isinstance(body.get("lang"), str) else None)
        voice = LANG_VOICE_MAP.get(lang, LANG_VOICE_MAP[DEFAULT_LANG])[style]

    # edge-tts talks to Microsoft's own read-aloud websocket endpoint, which
    # occasionally drops a connection with NoAudioReceived under normal use
    # (confirmed live: happened on rapid back-to-back calls during testing —
    # including, once, two attempts in a row — but always recovered with a
    # bit more breathing room) — nothing about our request is wrong, so a
    # few quick retries with backoff are worth it rather than leaving Mara
    # silent over a transient upstream hiccup.
    audio = b""
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            chunks: list[bytes] = []
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    chunks.append(chunk["data"])
            audio = b"".join(chunks)
            if audio:
                break
        except Exception as exc:  # noqa: BLE001 - edge_tts raises its own exception types
            last_error = exc
        if attempt < 2:
            await asyncio.sleep(0.5 * (attempt + 1))

    if not audio:
        detail = f"synthesis produced no audio ({last_error})" if last_error else "synthesis produced no audio"
        raise HTTPException(status_code=502, detail=detail)

    return Response(content=audio, media_type="audio/mpeg", headers={"X-Voice": voice})


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("MARA_TTS_PORT", "5753"))
    uvicorn.run(app, host="0.0.0.0", port=port)
