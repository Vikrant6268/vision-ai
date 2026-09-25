"""
run.py - start the Python AI service.

    python run.py

Reads host/port from the project's .env so Node and Python always agree
on the address.
"""

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

# .env lives in the project root, one level up from ai-service/
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("AI_SERVICE_HOST", "127.0.0.1"),
        port=int(os.getenv("AI_SERVICE_PORT", "8000")),
        reload=False,          # reload would load the model twice
    )
