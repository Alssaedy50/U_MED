FROM python:3.10-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

# Install build tools required for compiling tgcrypto C extensions if wheel is unavailable
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with UID 1000 (Mandatory for Hugging Face Spaces)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    DOWNLOAD_DIR=/tmp/teledrive_downloads

WORKDIR $HOME/app

# Install Python dependencies as non-root user
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project source files
COPY --chown=user:user config.py firebase_service.py gdrive.py main.py generate_session.py ./

# Create ephemeral download directory
RUN mkdir -p /tmp/teledrive_downloads

# Expose Hugging Face Spaces standard port
EXPOSE 7860

# Start concurrent aiohttp health server + UserBot listener + Admin notifier Bot
CMD ["python", "main.py"]
