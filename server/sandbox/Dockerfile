FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-sympy \
    python3-hypothesis \
    pyflakes3 \
    cppcheck \
    gcc \
    g++ \
    default-jdk-headless \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin sandbox
RUN find / -xdev -type f -perm /6000 -exec chmod a-s {} +
WORKDIR /srv
COPY service.py ./service.py
COPY seccomp-profile.json ./seccomp-profile.json
RUN chown -R sandbox:sandbox /srv
USER 10001:10001
ENV PORT=8790
EXPOSE 8790
CMD ["python3", "/srv/service.py"]
