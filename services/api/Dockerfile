FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Build marker: regenerated whenever the COPY above invalidates the layer cache
# (i.e. app.py changed). Used by app.py to detect a fresh build and wipe
# transient MongoDB collections before re-seeding from the config JSON files.
RUN date +%s%N > /app/.build_id

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health')" || exit 1

CMD ["python", "app.py"]
