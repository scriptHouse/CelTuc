"""API del historial de documentos generados.

- Registrar una exportacion: cualquier cuenta autenticada (lo hace sola la
  pagina de Documentos al descargar el PDF / Excel / ticket).
- Ver el historial: cada uno ve LO SUYO; los administradores ven el de todo el
  equipo.
- Eliminar: solo administradores, y es borrado logico (sale del historial pero
  no se pierde, y queda en /auditoria quien lo saco).

Los archivos no tienen URL publica: se sirven por un endpoint autenticado con
el content-type que decide el servidor segun el formato guardado.
"""
import logging
import re
from datetime import datetime, timedelta
from urllib.parse import quote

from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FORMATOS, DocumentoGenerado
from .serializers import DocumentoGeneradoSerializer, NuevoDocumentoSerializer

# nginx (deploy/nginx.conf) corta el request en 20 MB. Un PDF de estos pesa
# menos de 1 MB; el tope es un cinturon de seguridad, no un limite real.
MAX_TAMANIO_ARCHIVO = 15 * 1024 * 1024  # 15 MB

LIMITE_MAXIMO = 100
LIMITE_POR_DEFECTO = 30

logger = logging.getLogger(__name__)


def _documento_de_identidad(texto):
    """Los digitos de un DNI/CUIT escrito a mano, o '' si no parece un documento.

    En el papel el DNI se tipea libre ("12.345.678", "20-12345678-3"), pero la
    base de clientes lo guarda solo con digitos: sin normalizar, el mismo
    cliente entraria dos veces (una por factura y otra por documento).
    """
    digitos = re.sub(r'\D', '', texto or '')
    return digitos if 7 <= len(digitos) <= 11 else ''


def _registrar_cliente_del_documento(documento, telefono, email, usuario):
    """Da de alta (o actualiza) al cliente del documento en la base compartida.

    Mismo criterio de identidad que la factura y la venta de mostrador: manda el
    documento y, si no hay, el telefono. Es secundario a proposito: el papel ya
    se genero y se archivo, asi que un problema aca se registra y se sigue.

    Devuelve el resumen para el front, o None si no habia con que identificarlo.
    """
    try:
        from facturacion.clientes import registrar_cliente
        from facturacion.models import Comprobante

        doc = _documento_de_identidad(documento.cliente_documento)
        cliente = registrar_cliente(
            nombre=documento.cliente,
            doc_tipo=Comprobante.DocTipo.DNI if doc else '',
            doc_numero=doc,
            telefono=telefono,
            email=email,
            usuario=usuario,
        )
        if cliente is None:
            return None
        return {
            'id': cliente.pk,
            'nombre': cliente.nombre,
            'nuevo': bool(getattr(cliente, 'recien_creado', False)),
        }
    except Exception:
        logger.exception('No se pudo registrar el cliente del documento %s', documento.pk)
        return None


class HistorialDocumentos(permissions.BasePermission):
    """Ver y registrar: cualquier autenticado. Eliminar: solo administradores."""

    message = 'Solo un administrador puede eliminar documentos del historial.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method == 'DELETE':
            return user.es_administrador
        return True


def _visibles_para(usuario):
    """Documentos que esta cuenta puede ver: los suyos, o todos si es admin."""
    qs = DocumentoGenerado.objects.select_related('creado_por', 'creado_por__empleado')
    if not usuario.es_administrador:
        qs = qs.filter(creado_por=usuario)
    return qs


def _fecha_local(texto):
    """'2026-08-05' -> datetime aware al inicio de ese dia local (o None)."""
    try:
        dia = datetime.strptime(texto, '%Y-%m-%d')
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(dia)


def _entero(params, clave, defecto, minimo, maximo):
    try:
        return min(max(int(params.get(clave, defecto)), minimo), maximo)
    except (TypeError, ValueError):
        return defecto


class DocumentoListCreateView(APIView):
    """GET: el historial con filtros y paginacion. POST: registrar una exportacion."""

    permission_classes = [HistorialDocumentos]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        params = request.query_params
        qs = _visibles_para(request.user)

        tipo = (params.get('tipo') or '').strip()
        if tipo:
            qs = qs.filter(tipo=tipo)
        formato = (params.get('formato') or '').strip()
        if formato in DocumentoGenerado.Formato.values:
            qs = qs.filter(formato=formato)
        sucursal = (params.get('sucursal') or '').strip()
        if sucursal:
            qs = qs.filter(sucursal=sucursal)
        # Filtrar por autor solo tiene sentido para el admin: el resto ya esta
        # acotado a sus propios documentos por `_visibles_para`.
        autor = (params.get('usuario') or '').strip()
        if autor and request.user.es_administrador:
            qs = qs.filter(creado_por__username__iexact=autor)
        q = (params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(cliente__icontains=q)
                | Q(cliente_documento__icontains=q)
                | Q(referencia__icontains=q)
                | Q(detalle__icontains=q)
                | Q(tipo_nombre__icontains=q)
                | Q(nombre_archivo__icontains=q)
            )
        desde = _fecha_local(params.get('desde'))
        if desde is not None:
            qs = qs.filter(creado__gte=desde)
        hasta = _fecha_local(params.get('hasta'))
        if hasta is not None:
            qs = qs.filter(creado__lt=hasta + timedelta(days=1))

        limite = _entero(params, 'limit', LIMITE_POR_DEFECTO, 1, LIMITE_MAXIMO)
        offset = _entero(params, 'offset', 0, 0, 1_000_000)

        total = qs.count()
        respuesta = {
            'total': total,
            'resultados': DocumentoGeneradoSerializer(qs[offset:offset + limite], many=True).data,
        }
        # El resumen y las opciones de los filtros solo hacen falta en la
        # primera pagina: el "cargar mas" no vuelve a pagar esos conteos.
        if offset == 0:
            respuesta['resumen'] = self._resumen(request.user)
            respuesta['puede_ver_todo'] = bool(request.user.es_administrador)
            base = _visibles_para(request.user)
            respuesta['sucursales'] = sorted(
                s for s in base.values_list('sucursal', flat=True).distinct() if s
            )
            if request.user.es_administrador:
                respuesta['usuarios'] = sorted(
                    u for u in base.exclude(creado_por=None)
                    .values_list('creado_por__username', flat=True).distinct() if u
                )
        return Response(respuesta)

    @staticmethod
    def _resumen(usuario):
        inicio_hoy = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        base = _visibles_para(usuario)
        return {
            'hoy': base.filter(creado__gte=inicio_hoy).count(),
            'semana': base.filter(creado__gte=inicio_hoy - timedelta(days=6)).count(),
            'total': base.count(),
        }

    def post(self, request):
        archivo = request.FILES.get('archivo')
        if archivo is None:
            return Response({'detail': 'Falta el archivo del documento.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if archivo.size > MAX_TAMANIO_ARCHIVO:
            return Response({'detail': 'El documento pesa mas de 15 MB.'},
                            status=status.HTTP_400_BAD_REQUEST)

        entrada = NuevoDocumentoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        formato = datos.get('formato') or DocumentoGenerado.Formato.PDF
        usuario = request.user
        # Telefono y mail no se archivan con el documento: solo identifican al
        # cliente en la base compartida.
        telefono_cliente = datos.pop('cliente_telefono', '')
        email_cliente = datos.pop('cliente_email', '')
        documento = DocumentoGenerado.objects.create(
            **{**datos, 'formato': formato},
            archivo=archivo,
            # El content-type sale de nuestra tabla de formatos, NUNCA del que
            # declara el navegador: asi lo que se sirve de vuelta es siempre lo
            # que decimos que es.
            content_type=FORMATOS[formato][1],
            tamanio=archivo.size,
            creado_por=usuario,
            actualizado_por=usuario,
        )
        # El cliente del papel entra a la misma base que usan factura y venta:
        # asi la proxima operacion lo autocompleta y su historial queda completo.
        cuerpo = DocumentoGeneradoSerializer(documento).data
        registrado = _registrar_cliente_del_documento(
            documento, telefono_cliente, email_cliente, usuario,
        )
        if registrado is not None:
            cuerpo['cliente_registrado'] = registrado
        return Response(cuerpo, status=status.HTTP_201_CREATED)


class ProximoCuponView(APIView):
    """GET: el proximo N° de cupon correlativo para un tipo de documento.

    El contador se deriva del propio historial (no hay una tabla aparte): es el
    maximo cupon NUMERICO ya registrado para ese tipo, mas uno; sin registros
    arranca en 0. Se calcula sobre TODO el historial —de todo el equipo e
    incluyendo los borrados logicos— para que la numeracion sea global y un
    numero nunca se repita, aunque un administrador saque un documento del
    archivo. Solo devuelve numeros: no expone datos de documentos ajenos.
    """

    permission_classes = [HistorialDocumentos]

    def get(self, request):
        tipo = (request.query_params.get('tipo') or '').strip()
        if not tipo:
            return Response({'detail': 'Falta el tipo de documento.'},
                            status=status.HTTP_400_BAD_REQUEST)
        referencias = DocumentoGenerado.todos.filter(tipo=tipo).values_list(
            'referencia', flat=True,
        )
        # Cupones tipeados a mano pueden no ser numericos ("A-12"): se ignoran.
        numeros = [int(ref) for ref in (r.strip() for r in referencias) if ref.isdecimal()]
        ultimo = max(numeros) if numeros else None
        return Response({
            'proximo': 0 if ultimo is None else ultimo + 1,
            'ultimo': ultimo,
        })


class ClientesParaDocumentoView(APIView):
    """Autocompletado del cliente en los formularios de Documentos.

    Devuelve lo justo para completar un papel —nombre, documento, telefono y
    mail— de quien ya esta en la base. A proposito NO reusa el endpoint de
    Facturacion: aquel muestra compras, totales y ultima operacion y pide
    `ver_facturacion`; esto es el mismo dato de contacto que el empleado
    escribiria a mano, asi que alcanza con poder usar Documentos.
    """

    permission_classes = [HistorialDocumentos]

    # Ademas de acotar los campos, se acota el volumen: es un autocompletado.
    MAXIMO = 10
    MINIMO_BUSQUEDA = 2

    def get(self, request):
        buscar = (request.query_params.get('buscar') or '').strip()
        # Sin termino no se lista la base entera: solo se busca lo que se tipea.
        if len(buscar) < self.MINIMO_BUSQUEDA:
            return Response([])

        from facturacion.models import Cliente

        filtro = (
            Q(nombre__icontains=buscar)
            | Q(telefono__icontains=buscar)
            | Q(email__icontains=buscar)
        )
        digitos = re.sub(r'\D', '', buscar)
        if digitos:
            filtro |= Q(doc_numero__startswith=digitos)
        return Response([
            {
                'id': c.pk,
                'nombre': c.nombre,
                'doc_numero': c.doc_numero,
                'telefono': c.telefono,
                'email': c.email,
            }
            for c in Cliente.objects.filter(filtro).order_by('nombre')[:self.MAXIMO]
        ])


class DocumentoDetailView(APIView):
    """DELETE: saca el documento del historial (borrado logico). Solo admin."""

    permission_classes = [HistorialDocumentos]

    def delete(self, request, pk):
        documento = get_object_or_404(DocumentoGenerado, pk=pk)
        documento.delete(usuario=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentoArchivoView(APIView):
    """Sirve el archivo guardado, detras de la autenticacion.

    Por defecto va inline (el front lo abre en una pestaña para verlo); con
    ``?descargar=1`` fuerza la descarga con el nombre original.
    """

    permission_classes = [HistorialDocumentos]

    def get(self, request, pk):
        documento = get_object_or_404(_visibles_para(request.user), pk=pk)
        try:
            contenido = documento.archivo.open('rb')
        except (FileNotFoundError, ValueError):
            return Response({'detail': 'El archivo ya no esta disponible en el servidor.'},
                            status=status.HTTP_404_NOT_FOUND)
        respuesta = FileResponse(
            contenido,
            content_type=documento.content_type or FORMATOS.get(documento.formato, ('', ''))[1]
            or 'application/octet-stream',
        )
        nombre = documento.nombre_archivo or f'documento-{documento.pk}{documento.extension}'
        if not nombre.lower().endswith(documento.extension):
            nombre = f'{nombre}{documento.extension}'
        disposicion = 'attachment' if request.query_params.get('descargar') else 'inline'
        respuesta['Content-Disposition'] = f"{disposicion}; filename*=UTF-8''{quote(nombre)}"
        return respuesta
