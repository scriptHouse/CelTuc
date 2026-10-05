"""El dolar blue (DolarAPI) y el modo automatico del dolar del negocio.

Aca vive todo lo que habla con DolarAPI y lo que decide cuando recalcular el
dolar del negocio a partir del blue:

- `obtener_blue()`: la cotizacion vigente, con cache de 2 minutos y respaldo
  en base (`CotizacionDolarBlue`) por si la API no responde.
- `asegurar_dolar_al_dia()`: en modo automatico, revisa el blue y aplica la
  regla. Lo llaman las vistas que muestran precios o el gestor de dolar, asi
  el valor se mantiene al dia mientras alguien usa el sistema, sin necesitar
  un reloj en el servidor. En modo manual no hace nada (ni toca la red).

Nada de esto puede voltear la peticion que lo invoca: cualquier error queda
en el log y la vista sigue con el dolar que tenia.
"""
import logging

import requests
from django.core.cache import cache
from django.utils.dateparse import parse_datetime

from .models import ConfiguracionService, CotizacionDolarBlue, aplicar_dolar_automatico

logger = logging.getLogger(__name__)

URL = 'https://dolarapi.com/v1/dolares/blue'
CACHE_KEY = 'dolar_blue'
CACHE_SEGUNDOS = 120
# Cuanto espera el modo automatico entre dos revisiones del blue (por proceso).
# Es independiente de la cache del blue: evita leer la configuracion y
# recalcular en CADA listado de productos cuando ya se reviso hace un momento.
CACHE_KEY_REVISION = 'dolar_auto_revisado'
REVISION_SEGUNDOS = 60
# Tiempo maximo de espera a DolarAPI. El gestor (que muestra el blue) puede
# esperar un poco mas; un listado de precios no tiene que quedarse colgado.
TIMEOUT_GESTOR = 6
TIMEOUT_SILENCIOSO = 3


def consultar_dolarapi(timeout=TIMEOUT_GESTOR):
    """Pega a DolarAPI y devuelve la cotizacion normalizada, o None si fallo."""
    try:
        respuesta = requests.get(URL, timeout=timeout)
        respuesta.raise_for_status()
        cuerpo = respuesta.json()
    except (requests.RequestException, ValueError):
        return None
    return {
        'compra': cuerpo.get('compra'),
        'venta': cuerpo.get('venta'),
        'fecha': cuerpo.get('fechaActualizacion'),
        'desactualizado': False,
        'guardado': None,
    }


def ultima_guardada():
    """El respaldo en base cuando DolarAPI no responde (o None si nunca hubo)."""
    fila = CotizacionDolarBlue.ultima()
    if fila is None:
        return None
    return {
        'compra': fila.compra,
        'venta': fila.venta,
        'fecha': fila.fecha.isoformat() if fila.fecha else None,
        'desactualizado': True,
        'guardado': fila.actualizado.isoformat() if fila.actualizado else None,
    }


def blue_conocido():
    """Lo ultimo que se sabe del blue SIN tocar la red: cache o respaldo en base.

    Sirve para dejar contexto en el historial cuando alguien fija el dolar a
    mano («el blue estaba en 1.555»). Puede ser None si nunca se consulto.
    """
    datos = cache.get(CACHE_KEY)
    if datos is None:
        datos = ultima_guardada()
    return _blue_para_calculo(datos)


def obtener_blue(timeout=TIMEOUT_GESTOR):
    """La cotizacion del blue: de la cache, de DolarAPI o del respaldo en base.

    Una consulta exitosa se guarda en base y se cachea `CACHE_SEGUNDOS`. El
    respaldo NO se cachea: la proxima consulta vuelve a intentar contra la API.
    Devuelve None solo si nunca se pudo obtener ninguna cotizacion.
    """
    datos = cache.get(CACHE_KEY)
    if datos is not None:
        return datos
    datos = consultar_dolarapi(timeout=timeout)
    if datos is None:
        return ultima_guardada()
    CotizacionDolarBlue.guardar(datos['compra'], datos['venta'], datos['fecha'])
    cache.set(CACHE_KEY, datos, CACHE_SEGUNDOS)
    return datos


def _blue_para_calculo(datos):
    """La cotizacion en la forma que entiende `aplicar_dolar_automatico`."""
    if not datos:
        return None
    fecha = datos.get('fecha')
    if isinstance(fecha, str):
        try:
            fecha = parse_datetime(fecha)
        except ValueError:
            fecha = None
    return {'compra': datos.get('compra'), 'venta': datos.get('venta'), 'fecha': fecha}


def aplicar_si_corresponde(datos, config=None):
    """Aplica la regla automatica con esa cotizacion. Nunca lanza."""
    try:
        config = config or ConfiguracionService.obtener()
        if not config.es_automatico:
            return None
        return aplicar_dolar_automatico(config, _blue_para_calculo(datos))
    except Exception:
        logger.exception('No se pudo aplicar el dolar automatico.')
        return None


def asegurar_dolar_al_dia(timeout=TIMEOUT_SILENCIOSO):
    """En modo automatico, revisa el blue y recalcula el dolar si hace falta.

    Barato cuando no corresponde: en manual es una lectura de la configuracion
    y listo; en automatico, como mucho una consulta a DolarAPI cada
    `REVISION_SEGUNDOS` por proceso. Pensado para llamarse al inicio de las
    vistas que muestran precios. Devuelve la fila de historial si el dolar
    cambio, o None.
    """
    try:
        config = ConfiguracionService.obtener()
        if not config.es_automatico:
            return None
        if cache.get(CACHE_KEY_REVISION):
            return None
        cache.set(CACHE_KEY_REVISION, True, REVISION_SEGUNDOS)
        return aplicar_si_corresponde(obtener_blue(timeout=timeout), config)
    except Exception:
        logger.exception('No se pudo revisar el dolar automatico.')
        return None
