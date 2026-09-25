"""
run.py - start the Python AI service.

    python run.py

Reads host/port from the project's .env so Node and Python always agree
on the address.

Before anything imports PyTorch, this checks whether CUDA actually
WORKS - not just whether a GPU is present. torch.cuda.is_available()
can report True on a machine where every CUDA call then fails, usually
because the graphics driver is older than the CUDA version PyTorch was
built against.

That half-working state is worse than having no GPU at all: EasyOCR
selects the CPU correctly but its data loader still calls pin_memory(),
which needs CUDA, and crashes. So if the check fails we hide the GPU
with CUDA_VISIBLE_DEVICES, and every library cleanly uses the CPU.

The check runs in a separate process on purpose: once CUDA has been
initialised in this process, hiding it no longer has any effect.
"""

import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(PROJECT_ROOT / ".env")


def cuda_is_usable() -> bool:
    """Try a real (tiny) CUDA allocation in a throwaway process."""
    probe = "import torch; torch.zeros(8, device='cuda').sum().item()"

    try:
        result = subprocess.run(
            [sys.executable, "-c", probe],
            capture_output=True,
            timeout=60,
        )
    except (subprocess.SubprocessError, OSError):
        return False

    return result.returncode == 0


if __name__ == "__main__":
    if cuda_is_usable():
        print("GPU check: CUDA is working. Using the GPU.")
    else:
        # "-1" rather than "": on Windows an empty value deletes the
        # variable instead of blanking it, and the GPU stays visible.
        os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
        print("GPU check: CUDA is not usable on this machine. Using the CPU.")
        print("           Updating the NVIDIA graphics driver usually fixes this.")

    # Imported AFTER the environment is set, so torch picks it up.
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("AI_SERVICE_HOST", "127.0.0.1"),
        port=int(os.getenv("AI_SERVICE_PORT", "8000")),
        reload=False,          # reload would load the models twice
    )
