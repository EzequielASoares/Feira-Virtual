#!/bin/sh
set -e

echo "Verificando disponibilidade do banco de dados..."
python - << 'EOF'
import os
import sys
import time

engine = os.environ.get("DB_ENGINE", "sqlite").strip().lower()
if engine == "sqlite":
    print("Modo SQLite configurado.")
    sys.exit(0)

import pymysql

pymysql.version_info = (2, 2, 1, "final", 0)
pymysql.install_as_MySQLdb()

host = os.environ.get("DB_HOST", "127.0.0.1")
port = int(os.environ.get("DB_PORT", "3306"))
user = os.environ.get("DB_USER", "")
password = os.environ.get("DB_PASSWORD", "")
name = os.environ.get("DB_NAME", "feira_virtual")

for attempt in range(1, 31):
    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=name,
            connect_timeout=3,
        )
        conn.close()
        print("Banco de dados MySQL pronto!")
        sys.exit(0)
    except Exception as exc:
        print(f"Aguardando MySQL ({attempt}/30): {exc}")
        time.sleep(1)

print("Erro: não foi possível conectar ao MySQL a tempo.", file=sys.stderr)
sys.exit(1)
EOF

echo "Executando Django check e aplicando migrações..."
python manage.py check
python manage.py migrate --noinput

exec "$@"
