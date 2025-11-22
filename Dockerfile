# 例: 既存の Dockerfile に追加
COPY cli-entrypoint.sh /usr/local/bin/cli-entrypoint.sh
RUN chmod +x /usr/local/bin/cli-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/cli-entrypoint.sh"]

# CLI 専用のエントリポイントに変更（tini は任意）
ENTRYPOINT ["tini","--","/usr/local/bin/cli-entrypoint.sh"]
# CMD は未指定（docker run 時の引数が injectived のサブコマンドになる）
