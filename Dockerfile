FROM injectivelabs/injective-core:v1.17.0

# tini を使うなら入れる（不要ならこの RUN 行は削除してOK）
RUN apt-get update && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

COPY cli-entrypoint.sh /usr/local/bin/cli-entrypoint.sh
RUN chmod +x /usr/local/bin/cli-entrypoint.sh \
  && sed -i 's/\r$//' /usr/local/bin/cli-entrypoint.sh || true

# tini を使う版（tini を入れた場合）
ENTRYPOINT ["tini","--","/usr/local/bin/cli-entrypoint.sh"]

# tini を使わないならこちらにして、上の ENTRYPOINT は消す
# ENTRYPOINT ["/usr/local/bin/cli-entrypoint.sh"]
