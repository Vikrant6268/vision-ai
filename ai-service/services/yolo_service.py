"""
yolo_service.py - object detection with YOLO.

The model is loaded ONCE when the service starts (it takes a few
seconds) and then reused for every request, which keeps detection fast.

Runs on the GPU when CUDA is available, otherwise falls back to the CPU
so the service still works on machines without an NVIDIA card.
"""

import logging
from pathlib import Path

import torch
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# yolo11n = "nano": the smallest model. Fast enough for real-time use
# and accurate enough for common indoor/outdoor objects.
MODEL_NAME = "yolo11n.pt"
MODEL_DIR = Path(__file__).resolve().parent.parent / "models"

_model = None
_device = "cpu"


def _select_device() -> str:
    """
    Pick the best device that ACTUALLY works.

    torch.cuda.is_available() can return True on a machine where CUDA
    then fails to allocate - an outdated driver is the usual cause. So
    we try a real (tiny) allocation and fall back to the CPU if it
    throws, instead of crashing at startup.
    """
    if not torch.cuda.is_available():
        return "cpu"

    try:
        torch.zeros(8, device="cuda").sum().item()
        return "cuda"
    except Exception as exc:
        logger.warning("GPU present but unusable (%s). Falling back to CPU.",
                       type(exc).__name__)
        logger.warning("Updating the NVIDIA driver usually fixes this.")
        return "cpu"


def load_model() -> None:
    """Load YOLO into memory. Called once at startup."""
    global _model, _device

    if _model is not None:
        return

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    weights = MODEL_DIR / MODEL_NAME

    _device = _select_device()

    # Ultralytics downloads the weights automatically on first use.
    _model = YOLO(str(weights) if weights.exists() else MODEL_NAME)
    _model.to(_device)

    name = torch.cuda.get_device_name(0) if _device == "cuda" else "CPU"
    logger.info("YOLO loaded on %s (%s)", _device, name)


def get_device() -> str:
    return _device


def is_ready() -> bool:
    return _model is not None


def detect(image, confidence: float = 0.45):
    """
    Run detection on one image (a numpy BGR array from OpenCV).

    Returns a list of dicts:
        [{"label": "chair", "confidence": 0.87,
          "position": "left", "area": 0.12}, ...]

    `position` and `area` are what the obstacle feature needs: WHERE the
    object is across the frame, and how much of the frame it fills.
    A single camera cannot measure distance, so we never claim one.
    """
    if _model is None:
        raise RuntimeError("Model not loaded")

    height, width = image.shape[:2]
    frame_area = float(width * height)

    results = _model.predict(
        image,
        conf=confidence,
        device=_device,
        verbose=False,
    )

    detections = []

    for box in results[0].boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        centre_x = (x1 + x2) / 2

        # Split the frame into three vertical bands.
        if centre_x < width / 3:
            position = "left"
        elif centre_x > width * 2 / 3:
            position = "right"
        else:
            position = "center"

        detections.append({
            "label": _model.names[int(box.cls[0])],
            "confidence": round(float(box.conf[0]), 3),
            "position": position,
            "area": round(((x2 - x1) * (y2 - y1)) / frame_area, 4),
        })

    # Biggest objects first: they are the most relevant to the user.
    detections.sort(key=lambda d: d["area"], reverse=True)
    return detections
