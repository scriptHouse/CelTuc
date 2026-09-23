"""Reglas de identidad de las cuentas: usuario, email y contraseña.

Es el único lugar con las tres cosas que más confunden al dar de alta una
cuenta (desde Usuarios o desde Empleados):

- Que el usuario y el email no se repitan y, si se repiten, decir CON QUIÉN
  (qué cuenta y de qué empleado), para que el administrador sepa qué hacer.
- Que una cuenta eliminada no siga «ocupando» su usuario y su email para
  siempre. El borrado es lógico (la fila queda, por la auditoría), así que sin
  esto, después de quitarle el acceso a alguien, su email ya no se podía volver
  a usar y el error decía «ya está en uso» sin que se viera ninguna cuenta.
  Se resuelve recién cuando hace falta: al reutilizar el dato, la cuenta
  borrada pasa a llamarse `ana~12` / `ana@x.com~borrada12` (formatos que nadie
  puede escribir en un formulario, así que jamás chocan con una cuenta real).
- Los mensajes de error, en palabras de todos los días y con un ejemplo.
"""
import re
import unicodedata

from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework import serializers

MIN_USERNAME = 3
MAX_USERNAME = 30
MIN_PASSWORD = 6

_USERNAME_RE = re.compile(r'^[a-z0-9._-]+$')

# --- Mensajes -----------------------------------------------------------------

MSG_USERNAME_VACIO = (
    'Falta el usuario: es el nombre corto con el que la persona va a entrar '
    '(por ejemplo «lgomez»).'
)
MSG_USERNAME_CORTO = (
    f'El usuario es muy corto: tiene que tener al menos {MIN_USERNAME} letras o números '
    '(por ejemplo «lgomez»).'
)
MSG_USERNAME_LARGO = f'El usuario es muy largo: puede tener hasta {MAX_USERNAME} letras o números.'
MSG_USERNAME_SIGNOS = (
    'El usuario va todo junto, sin espacios, tildes ni ñ: solo letras, números y los '
    'signos . _ - (por ejemplo «lucas.gomez»).'
)
MSG_EMAIL_VACIO = 'Falta el email.'
MSG_EMAIL_INVALIDO = (
    'Ese email no parece bien escrito: tiene que tener una @ y un punto, '
    'por ejemplo «lucas@gmail.com».'
)
MSG_PASSWORD_VACIA = 'Falta la contraseña: es la clave secreta con la que la persona va a entrar.'
MSG_PASSWORD_CORTA = (
    f'La contraseña es muy corta: tiene que tener al menos {MIN_PASSWORD} letras o números. '
    'Si querés, tocá «Inventar una» y el sistema arma una fácil de recordar.'
)

# Para los `error_messages` de los campos de DRF (vacío / faltante / mal escrito).
ERRORES_USERNAME = {'blank': MSG_USERNAME_VACIO, 'required': MSG_USERNAME_VACIO, 'null': MSG_USERNAME_VACIO}
ERRORES_EMAIL = {
    'blank': MSG_EMAIL_VACIO, 'required': MSG_EMAIL_VACIO, 'null': MSG_EMAIL_VACIO,
    'invalid': MSG_EMAIL_INVALIDO,
}
ERRORES_PASSWORD = {'blank': MSG_PASSWORD_VACIA, 'required': MSG_PASSWORD_VACIA, 'null': MSG_PASSWORD_VACIA}


# --- Formato ------------------------------------------------------------------

def normalizar(valor) -> str:
    return (valor or '').strip().lower()


def problema_username(valor: str) -> str | None:
    """Qué le falta al usuario para ser válido (o None si está bien)."""
    valor = normalizar(valor)
    if not valor:
        return MSG_USERNAME_VACIO
    if not _USERNAME_RE.match(valor):
        return MSG_USERNAME_SIGNOS
    if len(valor) < MIN_USERNAME:
        return MSG_USERNAME_CORTO
    if len(valor) > MAX_USERNAME:
        return MSG_USERNAME_LARGO
    return None


def problema_email(valor: str) -> str | None:
    valor = normalizar(valor)
    if not valor:
        return MSG_EMAIL_VACIO
    try:
        validate_email(valor)
    except DjangoValidationError:
        return MSG_EMAIL_INVALIDO
    return None


def problema_password(valor: str) -> str | None:
    if not valor:
        return MSG_PASSWORD_VACIA
    if len(valor) < MIN_PASSWORD:
        return MSG_PASSWORD_CORTA
    return None


# --- Quién usa qué ------------------------------------------------------------

def _usuario_model():
    # Import perezoso: este módulo lo importan los serializers de `usuarios` y de
    # `empleados`, y el modelo tiene que estar cargado recién al usarlo.
    from .models import Usuario
    return Usuario


def cuenta_que_usa(campo: str, valor: str, excluir=None):
    """La cuenta VIVA que ya tiene ese usuario/email (o None).

    Las eliminadas no cuentan: su dato se libera al reutilizarlo (ver
    `liberar_identificadores`).
    """
    valor = normalizar(valor)
    if not valor:
        return None
    qs = _usuario_model().objects.filter(**{f'{campo}__iexact': valor})
    if excluir:
        qs = qs.exclude(pk=excluir)
    return qs.select_related('empleado').first()


def nombre_del_empleado(usuario) -> str | None:
    try:
        empleado = usuario.empleado
    except ObjectDoesNotExist:
        return None
    return empleado.nombre_completo if empleado else None


def quien_es(usuario) -> str:
    """«la cuenta @lgomez, de Lucas Gómez» — para decir con quién choca un dato."""
    if usuario.is_superuser:
        return f'la cuenta principal del sistema (@{usuario.username}, superadministrador)'
    empleado = nombre_del_empleado(usuario)
    if empleado:
        return f'la cuenta @{usuario.username}, de {empleado}'
    return f'la cuenta @{usuario.username} (no está vinculada a ningún empleado)'


def resumen_cuenta(usuario) -> dict:
    """Datos breves de la cuenta con la que choca un dato (para el front)."""
    return {
        'id': usuario.pk,
        'username': usuario.username,
        'empleado': nombre_del_empleado(usuario),
        'activa': usuario.is_active,
    }


def mensaje_username_en_uso(valor: str, usuario, sugerencias: list[str]) -> str:
    texto = f'El usuario «{normalizar(valor)}» ya lo tiene {quien_es(usuario)}. Cada persona necesita uno distinto'
    if sugerencias:
        opciones = ' o '.join(f'«{s}»' for s in sugerencias[:2])
        return f'{texto}: probá con {opciones}.'
    return f'{texto}: probá agregándole un número.'


def mensaje_email_en_uso(usuario) -> str:
    return (
        f'Ese email ya lo usa {quien_es(usuario)}. Cada cuenta necesita su propio email: '
        'escribí otro, o si es la misma persona, editá esa cuenta en vez de crear una nueva.'
    )


# --- Sugerencias de usuario ---------------------------------------------------

def _limpiar(texto: str) -> str:
    """«Gómez Ñandú» -> «gomeznandu» (sin tildes, ñ -> n, solo letras/números)."""
    sin_tildes = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]', '', sin_tildes.lower())


def _libre(candidato: str, excluir=None) -> bool:
    return problema_username(candidato) is None and cuenta_que_usa('username', candidato, excluir) is None


def sugerir_usernames(nombre: str = '', apellido: str = '', base: str = '', excluir=None, cantidad: int = 3) -> list[str]:
    """Usuarios libres para proponer: a partir del nombre, o de uno que ya está tomado."""
    primer_nombre = _limpiar(((nombre or '').split() or [''])[0])
    primer_apellido = _limpiar(((apellido or '').split() or [''])[0])
    base_limpia = re.sub(r'[^a-z0-9._-]', '', normalizar(base))

    candidatos: list[str] = []
    if primer_nombre and primer_apellido:
        candidatos += [
            f'{primer_nombre[0]}{primer_apellido}',
            f'{primer_nombre}.{primer_apellido}',
            f'{primer_nombre}{primer_apellido[0]}',
        ]
    if primer_nombre:
        candidatos.append(primer_nombre)
    if base_limpia:
        candidatos.insert(0, base_limpia)

    raices = [c[:MAX_USERNAME - 2] for c in candidatos if c]
    vistos: list[str] = []
    for c in raices:
        if c not in vistos and _libre(c, excluir):
            vistos.append(c)
        if len(vistos) >= cantidad:
            return vistos
    # Todas tomadas: la primera raíz con un número al final.
    if raices:
        raiz = raices[0]
        for n in range(2, 100):
            candidato = f'{raiz}{n}'
            if candidato not in vistos and _libre(candidato, excluir):
                vistos.append(candidato)
            if len(vistos) >= cantidad:
                break
    return vistos


# --- Validación para los serializers -----------------------------------------

def validar_username(valor: str, excluir=None) -> str:
    """Normaliza y valida el usuario; si choca, dice con quién y propone otros."""
    problema = problema_username(valor)
    if problema:
        raise serializers.ValidationError(problema, code='invalido')
    valor = normalizar(valor)
    usuario = cuenta_que_usa('username', valor, excluir)
    if usuario is not None:
        sugerencias = sugerir_usernames(base=valor, excluir=excluir)
        raise serializers.ValidationError(
            mensaje_username_en_uso(valor, usuario, sugerencias), code='en_uso',
        )
    return valor


def validar_email(valor: str, excluir=None) -> str:
    valor = normalizar(valor)
    usuario = cuenta_que_usa('email', valor, excluir)
    if usuario is not None:
        raise serializers.ValidationError(mensaje_email_en_uso(usuario), code='en_uso')
    return valor


def validar_password(valor: str) -> str:
    problema = problema_password(valor)
    if problema:
        raise serializers.ValidationError(problema, code='invalida')
    return valor


# --- Cuentas borradas que todavía ocupan un dato ------------------------------

def liberar_identificadores(username: str | None = None, email: str | None = None, excluir=None) -> None:
    """Renombra las cuentas ELIMINADAS que todavía tienen este usuario o email.

    Se llama justo antes de guardar una cuenta, dentro de la misma transacción:
    la columna es única, así que la fila borrada tiene que soltar el dato antes.
    Va con `update()` a propósito: no es una edición de nadie y no tiene que
    aparecer en la auditoría (ahí ya figura que la cuenta se eliminó).
    """
    Usuario = _usuario_model()
    for campo, valor in (('username', username), ('email', email)):
        valor = normalizar(valor)
        if not valor:
            continue
        ocupantes = Usuario.todos.filter(borrado=True, **{f'{campo}__iexact': valor})
        if excluir:
            ocupantes = ocupantes.exclude(pk=excluir)
        for pk in ocupantes.values_list('pk', flat=True):
            if campo == 'username':
                sufijo = f'~{pk}'
                nuevo = f'{valor[:MAX_USERNAME - len(sufijo)]}{sufijo}'
            else:
                sufijo = f'~borrada{pk}'
                nuevo = f'{valor[:254 - len(sufijo)]}{sufijo}'
            Usuario.todos.filter(pk=pk).update(**{campo: nuevo})
