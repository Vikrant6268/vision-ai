"""
proximity_service.py - "is something right against the camera?"

YOLO recognises objects by their SHAPE, so it goes blind exactly when
an object is closest: a chair filling the whole frame has no
recognisable outline left, just a wall of colour.

This module answers a different question that needs no recognition at
all - "has the view been blocked?" - using two cheap OpenCV measures:

  edge density  how much detail is in the frame. A normal scene is full
                of edges; something pressed against the lens has almost
                none.
  focus         Laplacian variance. Objects very close to a fixed-focus
                camera are heavily out of focus.

Measured on test frames of the same scene at increasing closeness:

    far          edges 0.2165   focus 2715
    near         edges 0.1611   focus 1884
    close        edges 0.0731   focus  290
    very close   edges 0.0424   focus   56     <- YOLO sees nothing here
    lens covered edges 0.0000   focus    0

Both conditions must be met, so a plain but in-focus wall across the
room does not trigger a false warning.
"""

import cv2

EDGE_THRESHOLD = 0.05
FOCUS_THRESHOLD = 120.0


def analyse(image) -> dict:
    """Return proximity measurements for one frame."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    edge_density = float(cv2.Canny(gray, 50, 150).mean()) / 255.0
    focus = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    return {
        "viewBlocked": edge_density < EDGE_THRESHOLD and focus < FOCUS_THRESHOLD,
        "edgeDensity": round(edge_density, 4),
        "focus": round(focus, 1),
    }
