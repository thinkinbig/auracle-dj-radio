# Thin wrapper: upstream qdrant image has no curl/wget for healthchecks.
FROM qdrant/qdrant:v1.18.2

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
