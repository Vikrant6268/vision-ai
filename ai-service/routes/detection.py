"""
POST /detect - object detection endpoint.

Receives a base64 image from the Node.js backend, runs YOLO, and
returns the objects found. Node turns that list into a sentence.
"""

import base64
import binascii
import logging

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services import proximity_service, yolo_service

logger = logging.getLogger(__name__)
router = APIRouter()


class DetectRequest(BaseModel):
    image: str = Field(..., description="Base64 image, with or without a data URL prefix")
    confidence: float = Field(0.45, ge=0.1, le=0.95)


def decode_image(data: str):
    """Turn a base64 string into an OpenCV image."""
    if "," in data[:64]:              # strip "data:image/jpeg;base64,"
        data = data.split(",", 1)[1]

    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Image data is not valid base64.")

    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Image could not be read.")

    return image


@router.post("/detect")
def detect(request: DetectRequest):
    if not yolo_service.is_ready():
        raise HTTPException(status_code=503, detail="Detection model is still loading.")

    image = decode_image(request.image)

    try:
        objects = yolo_service.detect(image, request.confidence)
    except Exception:
        logger.exception("Detection failed")
        raise HTTPException(status_code=500, detail="Detection failed.")

    return {
        "ok": True,
        "count": len(objects),
        "device": yolo_service.get_device(),
        "objects": objects,
        # Catches what YOLO cannot: something too close to recognise.
        **proximity_service.analyse(image),
    }
