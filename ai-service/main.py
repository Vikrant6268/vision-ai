"""
main.py - Vision AI Python service.

Handles the computer-vision work that Python does better than Node:
YOLO object detection now, OCR and face recognition later.

  Node.js  --HTTP-->  this service  -->  YOLO / OpenCV

It only listens on 127.0.0.1, so it is reachable from your own machine
(the Node backend) but not from the network.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from routes import detection, ocr
from services import ocr_service, yolo_service

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model at STARTUP, not on the first request, so the first
    # user does not wait several seconds extra.
    logger.info("Loading YOLO model...")
    yolo_service.load_model()

    # OCR models are large, so they load on FIRST USE rather than at
    # startup - most sessions never ask to read text.
    ocr_service.configure(use_gpu=yolo_service.get_device() == "cuda")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Vision AI - Python Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(detection.router)
app.include_router(ocr.router)


@app.get("/health")
def health():
    """Node calls this to check the service is up before using it."""
    return {
        "ok": True,
        "service": "vision-ai-python",
        "modelLoaded": yolo_service.is_ready(),
        "device": yolo_service.get_device(),
    }
