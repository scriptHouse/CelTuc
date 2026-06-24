"""
Configuracion de Django para el proyecto CelTuc.

Pensada para ser simple y clara:
- Un solo archivo de settings.
- Valores sensibles leidos de variables de entorno (.env) con defaults seguros
  para desarrollo.
- SQLite en local (cero config) y Postgres en produccion via DATABASE_URL.
"""
from datetime import timedelta
from pathlib import Path
import os
from urllib.parse import parse_qsl, unquote, urlparse

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Carga variables desde backend/.env (si existe). En produccion las inyecta
# docker-compose desde el .env de la raiz, asi que esto es inofensivo ahi.
load_dotenv(BASE_DIR / '.env')


def env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).lower() in ('1', 'true', 'yes', 'on')


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def env_list(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(',') if item.strip()]


def database_from_url(database_url: str) -> dict:
    try:
        parsed = urlparse(database_url)
    except ValueError as exc:
        raise ImproperlyConfigured(
            'DATABASE_URL no es valida. Revisa que la password este codificada para URL.'
        ) from exc
    if parsed.scheme not in ('postgres', 'postgresql'):
        raise ImproperlyConfigured('DATABASE_URL debe usar postgres:// o postgresql://.')
    if not parsed.hostname:
        raise ImproperlyConfigured('DATABASE_URL no incluye host.')

    options = dict(parse_qsl(parsed.query))
    options.setdefault('sslmode', 'require')

    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': unquote(parsed.path.lstrip('/')) or 'postgres',
        'USER': unquote(parsed.username or ''),
        'PASSWORD': unquote(parsed.password or ''),
        'HOST': parsed.hostname,
        'PORT': parsed.port or 5432,
        'CONN_MAX_AGE': env_int('DATABASE_CONN_MAX_AGE', 0),
        'CONN_HEALTH_CHECKS': True,
        'OPTIONS': options,
    }


# --- Seguridad ---------------------------------------------------------------
DEBUG = env_bool('DEBUG', True)

# SECRET_KEY: obligatoria en produccion. En desarrollo se usa un default; si
# DEBUG=False y no hay clave, la app NO arranca (fail-fast) en vez de firmar
# tokens con una clave conocida.
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-dev-key-solo-para-desarrollo'
    else:
        raise ImproperlyConfigured(
            'Falta la variable de entorno SECRET_KEY (obligatoria con DEBUG=False).'
        )
elif len(SECRET_KEY.encode('utf-8')) < 32:
    if DEBUG:
        SECRET_KEY = f'{SECRET_KEY}:celtuc-dev-signing-key-padding-v1'
    else:
        raise ImproperlyConfigured(
            'SECRET_KEY debe tener al menos 32 bytes para firmar JWT con HS256.'
        )

ALLOWED_HOSTS = env_list('ALLOWED_HOSTS', 'localhost,127.0.0.1')

# Detras de Traefik el TLS termina en el proxy; este header le dice a Django que
# la peticion original llego por HTTPS (necesario para el admin y las cookies).
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Origenes confiables para CSRF (login del admin sobre HTTPS detras del proxy).
CSRF_TRUSTED_ORIGINS = env_list(
    'CSRF_TRUSTED_ORIGINS',
    'https://celtuc.scripthouse.com.ar',
)


# --- Aplicaciones ------------------------------------------------------------
INSTALLED_APPS = [
    'unfold',  # debe ir antes de django.contrib.admin
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'comun',
    'usuarios',
    'empleados',
    'simulador',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',           # debe ir arriba
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',      # sirve estaticos del admin
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'celtuc.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

UNFOLD = {
    'SITE_TITLE': 'CelTuc Admin',
    'SITE_HEADER': 'CelTuc',
    'SITE_SUBHEADER': 'Panel de gestion',
}

WSGI_APPLICATION = 'celtuc.wsgi.application'


# --- Base de datos -----------------------------------------------------------
# Con DATABASE_URL definida usa Postgres; sin ella, SQLite local (desarrollo).
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
if DATABASE_URL:
    DATABASES = {'default': database_from_url(DATABASE_URL)}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


# --- Usuario y contrasenas ---------------------------------------------------
AUTH_USER_MODEL = 'usuarios.Usuario'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# --- Internacionalizacion ----------------------------------------------------
LANGUAGE_CODE = 'es-ar'
TIME_ZONE = 'America/Argentina/Buenos_Aires'
USE_I18N = True
USE_TZ = True


# --- Archivos estaticos ------------------------------------------------------
# WhiteNoise sirve los estaticos del admin (Django + unfold) en produccion sin
# necesidad de un volumen compartido con nginx.
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# --- Django REST Framework ---------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'usuarios.authentication.JWTAuthentication',
    ),
    # Fail-closed: por defecto TODO exige autenticacion. Las vistas publicas
    # (login, refresh) declaran AllowAny explicitamente.
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Limite de peticiones: frena fuerza bruta en login.
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/min',
        'user': '120/min',
        'login': '10/min',
    },
}


# --- JWT ---------------------------------------------------------------------
# Los tiempos REALES viven en usuarios/tokens.py (implementacion propia de JWT).
# Esto queda solo como referencia: refresh = 6 h de inactividad + 1 h de access.
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(hours=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}


# --- CORS (permite que el front en Vite hable con esta API en desarrollo) -----
CORS_ALLOWED_ORIGINS = env_list(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173',
)
