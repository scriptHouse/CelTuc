"""Impersonacion: entrar al panel como otra cuenta, desde el admin de Django.

Por que existe: el dueño necesita ver el sistema EXACTAMENTE como lo ve un
empleado (sus modulos, su sucursal, sus permisos) para dar soporte o reproducir
un problema, sin pedirle la contrasena a nadie.

Como funciona, en tres pasos:

1. El superadministrador aprieta "Impersonar" en /admin/usuarios/usuario/ y
   confirma. El backend emite un PASE de un solo uso (vive 1 minuto) y redirige
   al frontend con el pase en el FRAGMENTO de la URL (#...), que el navegador
   nunca manda al servidor: no queda en los logs de nginx ni en los del proxy.
2. El frontend canjea el pase por un par de tokens JWT de la cuenta impersonada
   (POST /api/auth/impersonar/canjear/). El pase se quema en el canje.
3. Esos tokens llevan la marca de quien esta detras (`act`) y un limite absoluto
   (`imp_exp`): pasadas 2 horas la sesion impersonada muere aunque se haya
   renovado, y si al superadministrador le sacan el poder, muere en el acto.

Reglas, deliberadamente estrictas:
- Solo el superadministrador impersona.
- Nunca a otro superadministrador (evita la escalada entre pares).
- Nunca a si mismo, ni a cuentas inactivas o borradas.
- Queda todo en el historial de auditoria: el inicio de la impersonacion y,
  ademas, cada accion hecha durante la sesion guarda quien estaba realmente
  detras (ver auditoria/registro.py).
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

# Ventana maxima de una sesion impersonada. Es un tope ABSOLUTO: no se estira
# renovando tokens, a diferencia de la sesion normal (6 h deslizantes).
DURACION_MAXIMA = timedelta(hours=2)


def motivo_no_impersonable(actor, objetivo) -> str | None:
    """Por que `actor` NO puede impersonar a `objetivo` (None = si puede)."""
    if actor is None or not actor.is_authenticated or not actor.is_active:
        return 'Necesitas una sesion activa para impersonar.'
    if not actor.is_superuser:
        return 'Solo un superadministrador puede impersonar cuentas.'
    if objetivo is None:
        return 'La cuenta no existe.'
    if objetivo.pk == actor.pk:
        return 'Ya estas usando el sistema con tu propia cuenta.'
    if objetivo.is_superuser:
        return 'No se puede impersonar a otro superadministrador.'
    if getattr(objetivo, 'borrado', False):
        return 'La cuenta esta eliminada.'
    if not objetivo.is_active:
        return 'La cuenta esta inactiva: no puede iniciar sesion.'
    return None


def claims_para(actor) -> dict:
    """Marcas que viajan en los JWT de una sesion impersonada.

    `act` (actor, RFC 8693) dice quien esta realmente detras; `imp_exp` es el
    momento en que la impersonacion caduca pase lo que pase.
    """
    return {
        'act': str(actor.pk),
        'imp_exp': int((timezone.now() + DURACION_MAXIMA).timestamp()),
    }


def url_de_retorno(pase: str) -> str:
    """A donde vuelve el navegador con el pase, listo para canjear.

    El pase va en el fragmento (#) a proposito: el navegador NO lo manda al
    servidor, asi que no aparece en ningun log. El frontend lo lee, lo canjea y
    limpia la barra de direcciones.
    """
    base = getattr(settings, 'FRONTEND_URL', '') or ''
    return f'{base.rstrip("/")}/impersonar#ticket={pase}'
