FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-sympy gcc g++ default-jdk-headless bubblewrap ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin sandbox
RUN chmod 0755 /usr/bin/bwrap
RUN find / -xdev -type f -perm /6000 -exec chmod a-s {} +
WORKDIR /srv
COPY service.py ./service.py
ENV PORT=8790
EXPOSE 8790
CMD ["python3", "/srv/service.py"]
