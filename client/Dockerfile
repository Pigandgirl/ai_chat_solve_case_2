FROM python:3.11-slim

WORKDIR /app

COPY build /usr/share/frontend
COPY serve.py /app/serve.py

EXPOSE 80

ENV LISTEN_PORT=80
ENV API_HOST=fastapi
ENV API_PORT=8000
ENV STATIC_DIR=/usr/share/frontend

CMD ["python", "/app/serve.py"]
