"""
POST /ocr - read text from a photo.

Used by "Read this" for books, signs, labels and printed pages.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from routes.detection import decode_image
from services import ocr_service

logger = logging.getLogger(__name__)
router = APIRouter()


class OcrRequest(BaseModel):
    image: str = Field(..., description="Base64 image, with or without a data URL prefix")
    language: str = Field("en", description="App language: en, hi, mr or gu")


@router.post("/ocr")
def ocr(request: OcrRequest):
    image = decode_image(request.image)

    try:
        result = ocr_service.read_text(image, request.language)
    except Exception:
        logger.exception("OCR failed")
        raise HTTPException(status_code=500, detail="Text reading failed.")

    return {"ok": True, **result}
