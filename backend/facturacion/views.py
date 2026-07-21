"""Vistas de la API de facturacion.

- Emisores: leer requiere `ver_facturacion`; crear/editar/eliminar (credenciales)
  es solo de administradores (`LecturaConPermisoEscrituraAdmin`).
- Comprobantes: leer y *emitir* requieren `ver_facturacion` (`PuedeFacturar`).
- La emision real la hace `arca.servicio.emitir`; si ARCA falla, devolvemos 502
  con un mensaje claro en `detail`.
"""
import base64
import logging

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from comun.mixins import AuditoriaMixin
from usuarios.permissions import LecturaConPermisoEscrituraSuperadmin

from .arca import servicio
from .arca.errores import ErrorARCA
from .clientes import registrar_cliente_desde_comprobante
from .email import EmailNoConfigurado, enviar_comprobante
from .limites import estado_limites_del_anio, guardar_limites, verificar_limite_mensual
from .models import Cliente, Comprobante, Emisor
from .permissions import PuedeFacturar
from .serializers import (
    ActualizarComprobanteSerializer,
    ClienteDetalleSerializer,
    ClienteSerializer,
    ClienteWriteSerializer,
    ComprobanteDetailSerializer,
    ComprobanteListSerializer,
    CrearComprobanteSerializer,
    EmisorSerializer,
    EnviarEmailSerializer,
    GuardarLimitesSerializer,
)

logger = logging.getLogger(__name__)


def _solo_digitos(valor: str) -> str:
    import re
    return re.sub(r'\D', '', valor or '')


def _descontar_stock(comprobante, sucursal, items, productos, usuario):
    """Descuenta stock por los items facturados con producto del catalogo.

    Devuelve la lista de avisos legibles por lo que NO se pudo descontar. La
    factura ya esta emitida en ARCA, asi que aca nunca se levanta error.
    """
    if sucursal is None or not any(productos):
        return []
    from django.core.exceptions import ValidationError

    from inventario.models import MovimientoStock, aplicar_ajuste

    avisos = []
    nota = f'Factura {comprobante.tipo} {comprobante.numero_formateado}'
    for item, producto in zip(items, productos):
        if producto is None:
            continue
        cantidad = item['cantidad']
        if cantidad != int(cantidad):
            avisos.append(f'"{item["descripcion"]}": la cantidad no es entera, '
                          'el stock quedo sin descontar.')
            continue
        try:
            aplicar_ajuste(
                producto, sucursal,
                delta=-int(cantidad),
                tipo=MovimientoStock.Tipo.VENTA,
                nota=nota,
                usuario=usuario,
            )
        except ValidationError as exc:
            avisos.append(' '.join(exc.messages))
        except Exception:  # el stock jamas voltea una factura emitida
            logger.exception('Error descontando stock del comprobante %s', comprobante.pk)
            avisos.append(f'"{item["descripcion"]}": no se pudo descontar el stock.')
    return avisos


# ===== Emisores =====

class _EmisoresVisiblesMixin:
    """Los facturadores ven SOLO emisores activos; el superadmin ve todos
    (incluidos los inactivos, para poder reactivarlos)."""

    def get_queryset(self):
        qs = Emisor.objects.all()
        if not self.request.user.is_superuser:
            qs = qs.filter(activo=True)
        return qs


class EmisorListCreateView(_EmisoresVisiblesMixin, AuditoriaMixin, generics.ListCreateAPIView):
    serializer_class = EmisorSerializer
    permission_classes = [LecturaConPermisoEscrituraSuperadmin]
    permiso_requerido = 'ver_facturacion'


class EmisorDetailView(_EmisoresVisiblesMixin, AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EmisorSerializer
    permission_classes = [LecturaConPermisoEscrituraSuperadmin]
    permiso_requerido = 'ver_facturacion'


class EmisorProbarConexionView(APIView):
    """Prueba conexion y credenciales del emisor contra ARCA, sin emitir."""

    permission_classes = [PuedeFacturar]

    def post(self, request, pk):
        emisor = get_object_or_404(Emisor, pk=pk)
        return Response(servicio.probar_conexion(emisor))


class EmisorLimitesView(APIView):
    """Limites de facturacion mensual del emisor (control interno, sin ARCA).

    - GET ``?anio=2026``: los 12 meses del año con su tope (o null) y lo ya
      facturado en cada uno. Lo puede ver quien factura (para la barra de uso).
    - PUT ``{anio, limites: [{mes, monto|null}]}``: aplica los topes de los meses
      recibidos de una vez (uno solo o varios); monto null quita el limite. Igual
      que editar el emisor, es solo del superadministrador.
    """

    permission_classes = [LecturaConPermisoEscrituraSuperadmin]
    permiso_requerido = 'ver_facturacion'

    def _anio(self, crudo):
        try:
            anio = int(crudo)
        except (TypeError, ValueError):
            return None
        return anio if 2000 <= anio <= 2100 else None

    def get(self, request, pk):
        emisor = get_object_or_404(Emisor, pk=pk)
        anio = self._anio(request.query_params.get('anio'))
        if anio is None:
            anio = timezone.localdate().year
        return Response({'anio': anio, 'limites': estado_limites_del_anio(emisor, anio)})

    def put(self, request, pk):
        emisor = get_object_or_404(Emisor, pk=pk)
        entrada = GuardarLimitesSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        anio = entrada.validated_data['anio']
        usuario = request.user if request.user.is_authenticated else None
        guardar_limites(emisor, anio, entrada.validated_data['limites'], usuario=usuario)
        return Response({'anio': anio, 'limites': estado_limites_del_anio(emisor, anio)})


# ===== Comprobantes =====

class ComprobanteListCreateView(generics.ListCreateAPIView):
    permission_classes = [PuedeFacturar]

    def get_queryset(self):
        qs = Comprobante.objects.select_related('emisor').prefetch_related('items')
        emisor = self.request.query_params.get('emisor')
        if emisor:
            qs = qs.filter(emisor_id=emisor)
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado_cobro=estado)
        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CrearComprobanteSerializer
        return ComprobanteListSerializer

    def create(self, request, *args, **kwargs):
        entrada = CrearComprobanteSerializer(data=request.data, context=self.get_serializer_context())
        entrada.is_valid(raise_exception=True)
        datos = dict(entrada.validated_data)
        emisor = datos.pop('emisor')
        # Datos de stock: se separan ANTES de emitir (ARCA no los conoce).
        sucursal_stock = datos.pop('sucursal_stock', None)
        confirmar_limite = datos.pop('confirmar_limite', False)
        items_limpios, productos_stock = [], []
        for item in datos['items']:
            item = dict(item)
            productos_stock.append(item.pop('producto', None))
            items_limpios.append(item)
        datos['items'] = items_limpios
        usuario = request.user if request.user.is_authenticated else None
        # Control interno de limite mensual, ANTES de pedir el CAE (no toca la
        # logica de ARCA): si el mes queda pasado del tope se devuelve 409 y el
        # front pide confirmacion; con `confirmar_limite` se emite igual.
        if not confirmar_limite:
            aviso_limite = verificar_limite_mensual(emisor, datos)
            if aviso_limite:
                return Response(aviso_limite, status=status.HTTP_409_CONFLICT)
        try:
            comprobante = servicio.emitir(emisor, datos, usuario=usuario)
        except ErrorARCA as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:  # nunca devolvemos un 500 opaco al facturar
            logger.exception('Error inesperado al emitir comprobante')
            return Response(
                {'detail': f'Error inesperado al emitir: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        # La factura ya salio (tiene CAE): el stock se descuenta a continuacion y
        # si algo no se puede (sin stock, cantidad no entera) se AVISA, jamas se
        # anula la emision ni se deja stock negativo.
        avisos_stock = _descontar_stock(comprobante, sucursal_stock, items_limpios,
                                        productos_stock, usuario)
        # Alimenta la base de clientes con lo cargado en la factura. Es secundario:
        # jamas puede voltear una emision ya autorizada (por eso el try/except).
        try:
            registrar_cliente_desde_comprobante(comprobante)
        except Exception:
            logger.exception('No se pudo registrar el cliente del comprobante %s', comprobante.pk)
        salida = ComprobanteDetailSerializer(comprobante, context=self.get_serializer_context())
        cuerpo = dict(salida.data)
        if avisos_stock:
            cuerpo['avisos_stock'] = avisos_stock
        return Response(cuerpo, status=status.HTTP_201_CREATED)


class ComprobanteDetailView(AuditoriaMixin, generics.RetrieveUpdateDestroyAPIView):
    queryset = Comprobante.objects.select_related('emisor').prefetch_related('items')
    permission_classes = [PuedeFacturar]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return ActualizarComprobanteSerializer
        return ComprobanteDetailSerializer

    def update(self, request, *args, **kwargs):
        # Un comprobante emitido es inmutable a nivel fiscal: solo cambia su estado
        # de cobro y las observaciones. Devolvemos el detalle completo, igual.
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ActualizarComprobanteSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        instance.refresh_from_db()
        detalle = ComprobanteDetailSerializer(instance, context=self.get_serializer_context())
        return Response(detalle.data)


class EnviarComprobanteEmailView(APIView):
    """Envia por email el PDF de un comprobante. El PDF lo genera el front (mismo
    que se descarga) y lo manda en base64; aca solo se adjunta y se envia por SMTP.
    Es una funcionalidad aparte: no afecta la emision ni el resto del modulo."""

    permission_classes = [PuedeFacturar]

    def post(self, request, pk):
        comprobante = get_object_or_404(Comprobante, pk=pk)
        entrada = EnviarEmailSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        crudo = datos['pdf_base64']
        if ',' in crudo:  # tolera un data URL "data:application/pdf;base64,XXXX"
            crudo = crudo.split(',', 1)[1]
        try:
            pdf_bytes = base64.b64decode(crudo, validate=True)
        except Exception:
            return Response({'detail': 'El PDF adjunto no es válido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            enviar_comprobante(comprobante, datos['email'], pdf_bytes, datos.get('mensaje'))
        except EmailNoConfigurado as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as exc:  # SMTP caido, credenciales mal, etc.
            logger.exception('Error enviando comprobante por email')
            return Response(
                {'detail': f'No se pudo enviar el email: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'detail': f'Factura enviada a {datos["email"]}.'})


# ===== Clientes =====

class ClienteListView(generics.ListAPIView):
    """Base de clientes: autocompletado del formulario y lista del gestor.

    - `?buscar=` filtra por nombre, teléfono o documento.
    - `?stats=1` agrega a cada cliente cantidad de compras, total gastado y última
      compra (lo pide la página de Clientes; el autocompletado no, para ser liviano).
    """

    serializer_class = ClienteSerializer
    permission_classes = [PuedeFacturar]

    def get_queryset(self):
        qs = Cliente.objects.all()
        buscar = (self.request.query_params.get('buscar') or '').strip()
        if buscar:
            filtro = Q(nombre__icontains=buscar) | Q(telefono__icontains=buscar)
            digitos = _solo_digitos(buscar)
            if digitos:
                filtro |= Q(doc_numero__icontains=digitos) | Q(telefono__icontains=digitos)
            qs = qs.filter(filtro)
        # El autocompletado del formulario (sin `stats`) solo necesita unas pocas
        # sugerencias; el gestor pide la base completa con `?stats=1`.
        if not self.request.query_params.get('stats'):
            qs = qs[:20]
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.request.query_params.get('stats'):
            from .clientes import stats_por_cliente
            ctx['stats'] = stats_por_cliente()
        return ctx


class ClienteDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Detalle del cliente con su historial de compras; permite editar y eliminar.

    El borrado es lógico (lo saca de la base) y NO toca los comprobantes: son
    documentos fiscales independientes.
    """

    queryset = Cliente.objects.all()
    permission_classes = [PuedeFacturar]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return ClienteWriteSerializer
        return ClienteDetalleSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = ClienteWriteSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        return Response(ClienteDetalleSerializer(instance).data)
