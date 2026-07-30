"""Contexto de peticion para la auditoria (threadlocal).

Las señales de Django no saben QUIEN esta guardando: el middleware deja aca la
peticion actual y los handlers la leen para conocer al usuario y su IP. Ademas
guarda memoria de lo creado en ESTA peticion, para no registrar como "edicion"
los retoques que el propio backend hace justo despues de crear un objeto (ej:
la venta que se vuelve a guardar con su total ya calculado).
"""
import threading

_local = threading.local()


class ContextoPeticion:
    def __init__(self, request):
        self.request = request
        # {(app_label.Modelo, pk)} creados durante esta peticion.
        self.creados = set()
        # Estado "antes" de un M2M, capturado al primer cambio: {(label, pk): [...]}.
        self.m2m_antes = {}
        # Registro ya emitido por un cambio M2M en esta peticion: {(label, pk): id}.
        self.registros_m2m = {}


def activar(request):
    _local.contexto = ContextoPeticion(request)


def desactivar():
    _local.contexto = None


def actual() -> ContextoPeticion | None:
    return getattr(_local, 'contexto', None)


def usuario_actual():
    """El usuario autenticado de la peticion en curso (o None).

    DRF autentica en la vista (no en el middleware), pero propaga el usuario
    autenticado al request de Django: para cuando las señales corren, ya esta.
    """
    contexto = actual()
    if contexto is None:
        return None
    user = getattr(contexto.request, 'user', None)
    if user is not None and user.is_authenticated:
        return user
    return None
