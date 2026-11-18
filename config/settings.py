import os
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

# Carrega variáveis do arquivo .env caso exista (sem sobrescrever variáveis já definidas)
env_file = BASE_DIR / ".env"
if env_file.exists():
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                key, value = key.strip(), value.strip()
                if (value.startswith('"') and value.endswith('"')) or (
                    value.startswith("'") and value.endswith("'")
                ):
                    value = value[1:-1]
                os.environ.setdefault(key, value)


def _env_bool(name, default=False):
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def _env_list(name, default=""):
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


DEBUG = _env_bool("DJANGO_DEBUG", default=True)

_DEV_FALLBACK_KEY = "django-insecure-feira-virtual-dev-only-change-this-secret-key-2026"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = _DEV_FALLBACK_KEY
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY deve ser configurada quando DJANGO_DEBUG=0.")
elif not DEBUG and (
    len(SECRET_KEY) < 32
    or SECRET_KEY.startswith(("dev-inseguro", "django-insecure-", "troque-por-"))
):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY insegura para ambiente de produção (DJANGO_DEBUG=0).")

ALLOWED_HOSTS = _env_list(
    "DJANGO_ALLOWED_HOSTS",
    "*" if DEBUG else "localhost,127.0.0.1",
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "usuarios",
    "catalogo",
    "pedidos",
    "avaliacoes",
    "painel",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
WSGI_APPLICATION = "config.wsgi.application"

# Seleção centralizada de banco de dados (sqlite ou mysql 8.4)
DB_ENGINE = os.environ.get("DB_ENGINE", "sqlite").strip().lower()

if DB_ENGINE == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.environ.get("SQLITE_PATH", str(BASE_DIR / "db.sqlite3")),
            "OPTIONS": {
                "timeout": 20,
                "transaction_mode": "IMMEDIATE",
            },
        }
    }
elif DB_ENGINE == "mysql":
    db_name = os.environ.get("DB_NAME", "feira_virtual").strip()
    db_user = os.environ.get("DB_USER", "").strip()
    db_password = os.environ.get("DB_PASSWORD", "")
    if not DEBUG and (not db_user or not db_password):
        raise ImproperlyConfigured("DB_USER e DB_PASSWORD são obrigatórios com DB_ENGINE=mysql em produção.")
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": db_name,
            "USER": db_user or "root",
            "PASSWORD": db_password,
            "HOST": os.environ.get("DB_HOST", "127.0.0.1"),
            "PORT": os.environ.get("DB_PORT", "3306"),
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "60")),
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }
else:
    raise ImproperlyConfigured(f"DB_ENGINE inválido: '{DB_ENGINE}'. Valores aceitos: 'sqlite' ou 'mysql'.")

AUTH_USER_MODEL = "usuarios.Usuario"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Fortaleza"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATIC_ROOT.mkdir(parents=True, exist_ok=True)
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
SERVE_MEDIA = _env_bool("SERVE_MEDIA", default=True)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS e Credenciais
CORS_ALLOW_ALL_ORIGINS = _env_bool("CORS_ALLOW_ALL_ORIGINS", default=False)
CORS_ALLOWED_ORIGINS = _env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000",
)
CORS_ALLOW_CREDENTIALS = True

# CSRF e Proxy Reverso
CSRF_TRUSTED_ORIGINS = _env_list(
    "CSRF_TRUSTED_ORIGINS",
    "http://127.0.0.1:8000,http://localhost:8000",
)
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = os.environ.get("JWT_COOKIE_SAMESITE", "Lax")
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.environ.get("JWT_COOKIE_SAMESITE", "Lax")

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

if not DEBUG:
    SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", default=True)
    CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", default=True)

# Cookies JWT
JWT_COOKIE_ACCESS_NAME = "fv_access_token"
JWT_COOKIE_REFRESH_NAME = "fv_refresh_token"
JWT_COOKIE_SECURE = _env_bool("JWT_COOKIE_SECURE", default=not DEBUG)
JWT_COOKIE_SAMESITE = os.environ.get("JWT_COOKIE_SAMESITE", "Lax")

# E-mail
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@feiravirtual.local")

_IS_TEST = "test" in sys.argv
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "usuarios.authentication.CookieJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "10000/minute" if _IS_TEST else os.environ.get("THROTTLE_ANON", "100/minute"),
        "user": "10000/minute" if _IS_TEST else os.environ.get("THROTTLE_USER", "1000/minute"),
        "auth": "10000/minute" if _IS_TEST else os.environ.get("THROTTLE_AUTH", "20/minute"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Feira Virtual API",
    "DESCRIPTION": "Plataforma de venda direta de produtores rurais (agricultura familiar).",
    "VERSION": "1.1.0",
}
