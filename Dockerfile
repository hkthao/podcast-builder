FROM python:3.10-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    COQUI_TOS_AGREED=1 \
    TTS_HOME=/app/models \
    HF_HOME=/app/models/hf

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg git ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY config.py generate.py ./

ENTRYPOINT ["python", "generate.py"]
