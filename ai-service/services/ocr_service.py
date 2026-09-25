"""
ocr_service.py - reading text from a photo with EasyOCR.

EasyOCR groups languages by SCRIPT, not by country. English uses Latin
letters; Hindi and Marathi both use Devanagari, so one reader handles
both. A reader is built the first time a script is needed and then kept,
because loading one takes several seconds and a few hundred MB of RAM.

Model files are stored under ai-service/models/easyocr so they stay on
the project drive instead of filling up C:.
"""

import logging
from pathlib import Path

import cv2
import easyocr

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "easyocr"

# Which EasyOCR languages to load for each of our app languages.
# English is always included: signs and labels in India are very often
# bilingual, and product packaging is usually English.
SCRIPTS = {
    "en": ["en"],
    "hi": ["hi", "en"],
    "mr": ["mr", "en"],
    "gu": ["gu", "en"],
}

# Readings below this are usually noise rather than real text.
MIN_CONFIDENCE = 0.35

_readers: dict[str, easyocr.Reader] = {}
_use_gpu = False


def configure(use_gpu: bool) -> None:
    """Told by the app at startup whether the GPU is actually usable."""
    global _use_gpu
    _use_gpu = use_gpu
    MODEL_DIR.mkdir(parents=True, exist_ok=True)


def _get_reader(lang: str) -> easyocr.Reader:
    """Build (once) and return the reader for this language."""
    languages = SCRIPTS.get(lang, SCRIPTS["en"])
    key = "+".join(languages)

    if key not in _readers:
        logger.info("Loading OCR model for %s (first time may take a minute)...", key)
        _readers[key] = easyocr.Reader(
            languages,
            gpu=_use_gpu,
            model_storage_directory=str(MODEL_DIR),
            download_enabled=True,
            verbose=False,
        )
        logger.info("OCR model %s ready", key)

    return _readers[key]


def preprocess(image):
    """
    Give OCR the best chance on a photo taken by hand.

    Grayscale removes colour noise, and CLAHE evens out lighting so text
    in a shadow or under a bright lamp is still readable.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)


def read_text(image, lang: str = "en") -> dict:
    """
    Extract text from an image.

    Returns {"text": "...", "confidence": 0.0-1.0, "blocks": n}.
    An empty string means nothing readable was found - the caller turns
    that into "I could not read the text clearly."
    """
    reader = _get_reader(lang)
    results = reader.readtext(preprocess(image), detail=1, paragraph=False)

    kept = [(text, conf) for _box, text, conf in results if conf >= MIN_CONFIDENCE]

    if not kept:
        return {"text": "", "confidence": 0.0, "blocks": 0}

    text = " ".join(t.strip() for t, _ in kept if t.strip())
    average = sum(c for _, c in kept) / len(kept)

    return {
        "text": text,
        "confidence": round(float(average), 3),
        "blocks": len(kept),
    }


def is_loaded(lang: str = "en") -> bool:
    return "+".join(SCRIPTS.get(lang, SCRIPTS["en"])) in _readers
