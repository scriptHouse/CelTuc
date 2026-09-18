from decimal import Decimal

from rest_framework import serializers

from inventario.models import Sucursal

from .models import Caja, CierreCaja, ConfiguracionCaja, MedioPago, MovimientoCaja, SesionCaja

_CERO = Decimal('0')


def _decimal(**kwargs):
    return serializers.DecimalField(
        max_digits=14, decimal_places=2, coerce_to_string=False, **kwargs,
    )


class ConfiguracionCajaSerializer(serializers.ModelSerializer):
    tolerancia_monto = _decimal()
    fondo_sugerido = _decimal()

    class Meta:
        model = ConfiguracionCaja
        fields = (
            'cierre_ciego', 'tolerancia_activa', 'tolerancia_monto', 'retiros_habilitados',
            'multi_caja', 'exigir_lote', 'fondo_sugerido', 'denominaciones', 'por_sucursal',
            'actualizado',
        )
        # `por_sucursal` no se escribe por aca: cambiar de modo valida turnos y
        # arma las cajas de cada sucursal (ver `ModoSucursalSerializer`).
        read_only_fields = ('por_sucursal', 'actualizado')

    def validate_denominaciones(self, value):
        limpias = sorted({int(d) for d in value if int(d) > 0}, reverse=True)
        if not limpias:
            raise serializers.ValidationError('Deja al menos una denominacion activa.')
        return limpias


class CajaSerializer(serializers.ModelSerializer):
    sucursal = serializers.PrimaryKeyRelatedField(
        queryset=Sucursal.objects.all(), allow_null=True, required=False,
    )
    sucursal_nombre = serializers.CharField(source='sucursal.nombre', read_only=True, default=None)

    class Meta:
        model = Caja
        fields = ('id', 'nombre', 'canal', 'sucursal', 'sucursal_nombre', 'orden', 'activa', 'creado')
        read_only_fields = ('creado',)
        # Los validadores automaticos de DRF para las constraints unicas no
        # entienden que el ambito depende de la sucursal (chocarian la
        # «Facturación RI» de Salta con la compartida): la unicidad se valida en
        # `validate`, y la base la sigue garantizando con sus constraints.
        validators = []
        extra_kwargs = {'nombre': {'validators': []}, 'canal': {'validators': []}}

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def validate(self, attrs):
        # Nombre y canal son unicos DENTRO del ambito de la caja: las
        # compartidas entre si, o las de una misma sucursal entre si.
        if self.instance is not None:
            if 'sucursal' in attrs and attrs['sucursal'] != self.instance.sucursal:
                raise serializers.ValidationError({
                    'sucursal': 'La sucursal de una caja no se cambia: sus turnos y cierres son de esa sucursal.',
                })
            sucursal = self.instance.sucursal
        else:
            sucursal = attrs.get('sucursal')
        mismas = Caja.objects.filter(sucursal=sucursal)
        if self.instance is not None:
            mismas = mismas.exclude(pk=self.instance.pk)

        nombre = attrs.get('nombre')
        if nombre and mismas.filter(nombre__iexact=nombre).exists():
            raise serializers.ValidationError({'nombre': 'Ya existe una caja con ese nombre.'})
        canal = attrs.get('canal')
        if canal and mismas.filter(canal=canal).exists():
            raise serializers.ValidationError({
                'canal': 'Ya hay una caja para ese canal: no puede haber dos, '
                'las ventas no sabrian a cual entrar.',
            })
        return attrs


class SucursalCajaSerializer(serializers.ModelSerializer):
    """Una sucursal vista desde Caja: si tiene caja y si tiene un turno abierto."""

    tiene_caja = serializers.BooleanField(read_only=True)
    turno_abierto = serializers.BooleanField(read_only=True)

    class Meta:
        model = Sucursal
        fields = ('id', 'nombre', 'orden', 'activa', 'tiene_caja', 'turno_abierto')


class CambiarCajaSucursalSerializer(serializers.Serializer):
    tiene_caja = serializers.BooleanField()


class ModoSucursalSerializer(serializers.Serializer):
    """Prender o apagar la caja por sucursal (y, al prender, cuales tienen caja)."""

    por_sucursal = serializers.BooleanField()
    sucursales_con_caja = serializers.PrimaryKeyRelatedField(
        queryset=Sucursal.objects.filter(activa=True), many=True, required=False,
    )


class SesionCajaSerializer(serializers.ModelSerializer):
    caja = serializers.PrimaryKeyRelatedField(read_only=True)
    fondo_inicial = _decimal()
    abierta_en = serializers.DateTimeField(source='creado', read_only=True)
    abierta_por = serializers.SerializerMethodField()

    class Meta:
        model = SesionCaja
        fields = (
            'id', 'caja', 'numero', 'estado', 'abierta_por', 'abierta_en',
            'fondo_inicial', 'conteo_apertura', 'nota_apertura',
        )

    def get_abierta_por(self, obj):
        return obj.creado_por.username if obj.creado_por_id else None


class MovimientoCajaSerializer(serializers.ModelSerializer):
    sesion = serializers.PrimaryKeyRelatedField(read_only=True)
    caja = serializers.IntegerField(source='sesion.caja_id', read_only=True)
    monto = _decimal()
    venta = serializers.PrimaryKeyRelatedField(read_only=True)
    facturacion = serializers.SerializerMethodField()
    fuera_de_circuito = serializers.SerializerMethodField()
    usuario = serializers.SerializerMethodField()
    fecha = serializers.DateTimeField(source='creado', read_only=True)

    class Meta:
        model = MovimientoCaja
        fields = (
            'id', 'caja', 'sesion', 'tipo', 'medio', 'monto', 'motivo', 'detalle',
            'venta', 'facturacion', 'fuera_de_circuito', 'usuario', 'fecha',
        )

    def get_facturacion(self, obj):
        """Como se facturo ESTA parte del cobro (None si el movimiento es manual).

        Se lee del pago exacto: una venta cobrada mitad facturada y mitad no
        tiene un movimiento por parte, y cada uno informa la suya. Las ventas
        viejas (sin pago vinculado) caen en la facturacion de la venta.
        """
        if obj.pago_id:
            return obj.pago.facturacion
        return obj.venta.facturacion if obj.venta_id else None

    def get_fuera_de_circuito(self, obj):
        """Esta parte se cobro distinto de lo que sugeria la caja (y se acepto)."""
        return bool(obj.pago.fuera_de_circuito) if obj.pago_id else False

    def get_usuario(self, obj):
        return obj.creado_por.username if obj.creado_por_id else None


class CierreCajaSerializer(serializers.ModelSerializer):
    caja = serializers.IntegerField(source='sesion.caja_id', read_only=True)
    sucursal = serializers.IntegerField(source='sesion.caja.sucursal_id', read_only=True)
    sesion = serializers.PrimaryKeyRelatedField(read_only=True)
    sesion_numero = serializers.IntegerField(source='sesion.numero', read_only=True)
    abierta_en = serializers.DateTimeField(source='sesion.creado', read_only=True)
    cerrada_en = serializers.DateTimeField(source='creado', read_only=True)
    abierta_por = serializers.SerializerMethodField()
    cerrado_por = serializers.SerializerMethodField()
    fondo_inicial = _decimal(source='sesion.fondo_inicial', read_only=True)
    ingresos = _decimal()
    egresos = _decimal()
    retiros = _decimal()
    diferencia_total = _decimal()
    fondo_siguiente = _decimal()
    retiro_final = _decimal()
    movimientos = MovimientoCajaSerializer(source='sesion.movimientos', many=True, read_only=True)

    class Meta:
        model = CierreCaja
        fields = (
            'id', 'numero', 'caja', 'caja_nombre', 'sucursal', 'sucursal_nombre',
            'sesion', 'sesion_numero',
            'abierta_en', 'cerrada_en', 'abierta_por', 'cerrado_por', 'fondo_inicial',
            'ventas_por_medio', 'operaciones_por_medio', 'ingresos', 'egresos', 'retiros',
            'esperado_por_medio', 'contado_por_medio', 'conteo_cierre',
            'diferencia_por_medio', 'diferencia_total', 'motivo_diferencia', 'nota_diferencia',
            'cierre_ciego', 'fondo_siguiente', 'retiro_final', 'movimientos',
        )

    def get_abierta_por(self, obj):
        return obj.sesion.creado_por.username if obj.sesion.creado_por_id else None

    def get_cerrado_por(self, obj):
        return obj.creado_por.username if obj.creado_por_id else None


# ===== Entradas de las operaciones =====

def _conteo_billetes():
    """Desglose {denominacion: cantidad} — claves numericas en JSON llegan como str."""
    return serializers.DictField(
        child=serializers.IntegerField(min_value=0), required=False, allow_null=True,
    )


class AbrirCajaSerializer(serializers.Serializer):
    caja = serializers.PrimaryKeyRelatedField(queryset=Caja.objects.filter(activa=True))
    fondo_inicial = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=_CERO)
    conteo_apertura = _conteo_billetes()
    nota_apertura = serializers.CharField(required=False, allow_blank=True, max_length=200)


class CrearMovimientoSerializer(serializers.Serializer):
    """Movimiento MANUAL: las ventas entran solas desde inventario, no por aca."""

    sesion = serializers.PrimaryKeyRelatedField(
        queryset=SesionCaja.objects.filter(estado=SesionCaja.Estado.ABIERTA),
    )
    tipo = serializers.ChoiceField(choices=[
        MovimientoCaja.Tipo.INGRESO,
        MovimientoCaja.Tipo.EGRESO,
        MovimientoCaja.Tipo.RETIRO,
    ])
    medio = serializers.ChoiceField(choices=MedioPago.choices, required=False)
    monto = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    motivo = serializers.CharField(max_length=200)
    detalle = serializers.CharField(required=False, allow_blank=True, max_length=200)


class CerrarCajaSerializer(serializers.Serializer):
    sesion = serializers.PrimaryKeyRelatedField(
        queryset=SesionCaja.objects.filter(estado=SesionCaja.Estado.ABIERTA),
    )
    contado_por_medio = serializers.DictField(
        child=serializers.DecimalField(max_digits=14, decimal_places=2, min_value=_CERO),
    )
    conteo_cierre = _conteo_billetes()
    fondo_siguiente = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=_CERO)
    motivo_diferencia = serializers.CharField(required=False, allow_blank=True, max_length=120)
    nota_diferencia = serializers.CharField(required=False, allow_blank=True, max_length=500)
