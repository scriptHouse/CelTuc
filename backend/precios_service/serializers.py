from rest_framework import serializers

from comun.planillas import MAX_COLUMNAS
from comun.planillas import precio as precio_planilla

from .importacion import CAMPOS as CAMPOS_IMPORTACION
from .models import (
    ConfiguracionService,
    Dispositivo,
    HistorialDolar,
    ItemService,
    PrecioItemService,
    SeccionService,
    VarianteSeccion,
    registrar_cambio_dolar,
    resolver_precios,
)


def _campo_precio(**extra):
    return serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0,
        coerce_to_string=False, required=False, allow_null=True, **extra,
    )


# Los campos que definen la regla del dolar automatico. Cambiar cualquiera
# recalcula el dolar al instante (si el modo es automatico).
CAMPOS_REGLA_DOLAR = (
    'dolar_modo', 'dolar_referencia', 'dolar_ajuste_tipo', 'dolar_ajuste_valor',
    'dolar_redondeo', 'dolar_cambio_minimo',
)


class ConfiguracionServiceSerializer(serializers.ModelSerializer):
    """Parametros globales. Cambiar el dolar recalcula toda la lista derivada.

    El dolar se escribe SIEMPRE por `registrar_cambio_dolar`, asi cada valor
    queda en el historial. En modo automatico no se acepta un `dolar` suelto:
    el valor lo calcula la regla (para fijarlo a mano hay que pasar a manual,
    y el front lo hace en la misma peticion: `dolar_modo` + `dolar`).
    """

    dolar = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, coerce_to_string=False, required=False,
    )
    descuento_cash_pct = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100, coerce_to_string=False,
        required=False,
    )
    dolar_ajuste_valor = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, required=False,
    )
    dolar_redondeo = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, coerce_to_string=False, required=False,
    )
    dolar_cambio_minimo = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, coerce_to_string=False, required=False,
    )
    # La regla en una frase («blue venta + $25»), para los chips de la UI.
    dolar_regla = serializers.CharField(source='regla_descripcion', read_only=True)
    # Motivo opcional al fijar el dolar a mano: queda en el historial.
    dolar_nota = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=200,
    )

    class Meta:
        model = ConfiguracionService
        fields = (
            'dolar', 'dolar_modo', 'dolar_referencia', 'dolar_ajuste_tipo',
            'dolar_ajuste_valor', 'dolar_redondeo', 'dolar_cambio_minimo',
            'dolar_calculado_en', 'dolar_regla', 'dolar_nota',
            'descuento_cash_pct', 'redondeo_ars', 'actualizado',
        )
        read_only_fields = ('actualizado', 'dolar_calculado_en')

    def validate(self, data):
        modo_actual = self.instance.dolar_modo if self.instance else ConfiguracionService.Modo.MANUAL
        modo = data.get('dolar_modo', modo_actual)
        if modo == ConfiguracionService.Modo.AUTOMATICO and 'dolar' in data:
            raise serializers.ValidationError({'dolar': (
                'En modo automático el dólar lo calcula la regla a partir del blue. '
                'Para fijarlo a mano, pasá el modo a manual.'
            )})
        if 'dolar' in data and data['dolar'] <= 0:
            raise serializers.ValidationError({'dolar': 'El dólar tiene que ser mayor a 0.'})
        return data

    def update(self, instance, validated_data):
        from . import dolar as modulo_dolar  # tardio: dolar.py importa models

        nuevo_dolar = validated_data.pop('dolar', None)
        nota = validated_data.pop('dolar_nota', '')
        usuario = validated_data.get('actualizado_por')
        cambia_regla = any(
            campo in validated_data and getattr(instance, campo) != validated_data[campo]
            for campo in CAMPOS_REGLA_DOLAR
        )
        instance = super().update(instance, validated_data)

        if nuevo_dolar is not None and not instance.es_automatico:
            # Se anota tambien el blue que habia a la vista (sin pegarle a la
            # API: lo ultimo conocido alcanza para dejar contexto).
            registrar_cambio_dolar(
                instance, nuevo_dolar, origen=HistorialDolar.Origen.MANUAL,
                usuario=usuario, blue=modulo_dolar.blue_conocido(), nota=nota,
            )
        if instance.es_automatico and cambia_regla:
            # Recien activado o con la regla cambiada: se aplica ya, con el
            # blue vigente, para que la respuesta traiga el dolar nuevo.
            modulo_dolar.aplicar_si_corresponde(modulo_dolar.obtener_blue(), instance)
        return instance


class HistorialDolarSerializer(serializers.ModelSerializer):
    """Una fila del historial: el valor, su vigencia y de donde salio."""

    valor = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    valor_anterior = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, allow_null=True,
    )
    blue_compra = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, allow_null=True,
    )
    blue_venta = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, allow_null=True,
    )
    ajuste_valor = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, allow_null=True,
    )
    redondeo = serializers.DecimalField(
        max_digits=8, decimal_places=2, coerce_to_string=False, allow_null=True,
    )
    usuario = serializers.CharField(source='usuario_username', read_only=True)
    regla = serializers.CharField(source='regla_descripcion', read_only=True)
    vigente = serializers.BooleanField(read_only=True)

    class Meta:
        model = HistorialDolar
        fields = (
            'id', 'valor', 'valor_anterior', 'vigente_desde', 'vigente_hasta', 'vigente',
            'origen', 'usuario', 'blue_compra', 'blue_venta', 'blue_fecha',
            'referencia', 'ajuste_tipo', 'ajuste_valor', 'redondeo', 'regla', 'nota',
        )


class DispositivoSerializer(serializers.ModelSerializer):
    """Equipo del catalogo del taller (alimenta el selector de la pagina)."""

    class Meta:
        model = Dispositivo
        fields = ('id', 'nombre', 'linea', 'orden', 'activo')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        repetido = Dispositivo.objects.filter(nombre__iexact=value)
        if self.instance is not None:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            raise serializers.ValidationError('Ya existe un equipo con ese nombre.')
        return value

    def validate_linea(self, value):
        return value.strip()


class VarianteSeccionSerializer(serializers.ModelSerializer):
    """Calidad/columna de la seccion. El `id` se conserva al guardar para no
    perder los precios ya cargados contra esa variante."""

    id = serializers.IntegerField(required=False)

    class Meta:
        model = VarianteSeccion
        fields = ('id', 'nombre', 'orden')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre de la variante es obligatorio.')
        return value


class PrecioItemServiceSerializer(serializers.ModelSerializer):
    """Precios crudos de una fila x variante. `efectivo` (los 4 valores ya
    resueltos con la formula + overrides) lo agrega el serializer del item."""

    id = serializers.IntegerField(required=False)
    variante = serializers.PrimaryKeyRelatedField(queryset=VarianteSeccion.objects.all())
    precio_lista_usd = _campo_precio()
    precio_cash_usd = _campo_precio()
    precio_lista_ars = _campo_precio()
    precio_cash_ars = _campo_precio()

    class Meta:
        model = PrecioItemService
        fields = (
            'id', 'variante',
            'precio_lista_usd', 'precio_cash_usd', 'precio_lista_ars', 'precio_cash_ars',
        )


class ItemServiceSerializer(serializers.ModelSerializer):
    """Fila de la lista con sus precios anidados (reemplazo total al guardar).

    En la lectura, cada precio sale con `efectivo`: los 4 valores resueltos
    (override si hay, formula si no) usando el dolar/descuento vigentes.
    """

    seccion = serializers.PrimaryKeyRelatedField(queryset=SeccionService.objects.all())
    dispositivos = serializers.PrimaryKeyRelatedField(
        queryset=Dispositivo.objects.all(), many=True, required=False,
    )
    precios = PrecioItemServiceSerializer(many=True, required=False)

    class Meta:
        model = ItemService
        fields = ('id', 'seccion', 'etiqueta', 'nota', 'concepto_generico_factura',
                  'dispositivos', 'orden', 'activo', 'precios')

    def validate_etiqueta(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('La etiqueta es obligatoria.')
        return value

    def validate(self, data):
        seccion = data.get('seccion', self.instance.seccion if self.instance else None)
        precios = data.get('precios')
        if precios:
            variantes = [p['variante'] for p in precios]
            if len(variantes) != len(set(variantes)):
                raise serializers.ValidationError({'precios': 'Hay variantes repetidas.'})
            ajenas = [v for v in variantes if seccion and v.seccion_id != seccion.id]
            if ajenas:
                raise serializers.ValidationError(
                    {'precios': 'Hay precios de variantes que no pertenecen a la seccion.'}
                )
        return data

    def _config(self):
        return self.context.get('config') or ConfiguracionService.obtener()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        config = self._config()
        descuento = instance.seccion.descuento_cash_pct
        if descuento is None:
            descuento = config.descuento_cash_pct
        por_id = {p.id: p for p in instance.precios.all()}
        for fila in data['precios']:
            fila['efectivo'] = resolver_precios(por_id[fila['id']], config, descuento)
        return data

    def _reemplazar_precios(self, item, precios):
        """Reescribe los precios de la fila con la lista recibida."""
        item.precios.all().delete()
        PrecioItemService.objects.bulk_create([
            PrecioItemService(
                item=item,
                variante=fila['variante'],
                precio_lista_usd=fila.get('precio_lista_usd'),
                precio_cash_usd=fila.get('precio_cash_usd'),
                precio_lista_ars=fila.get('precio_lista_ars'),
                precio_cash_ars=fila.get('precio_cash_ars'),
            )
            for fila in precios
        ])

    def create(self, validated_data):
        precios = validated_data.pop('precios', [])
        dispositivos = validated_data.pop('dispositivos', [])
        item = ItemService.objects.create(**validated_data)
        item.dispositivos.set(dispositivos)
        self._reemplazar_precios(item, precios)
        return item

    def update(self, instance, validated_data):
        precios = validated_data.pop('precios', None)
        dispositivos = validated_data.pop('dispositivos', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        if dispositivos is not None:
            instance.dispositivos.set(dispositivos)
        if precios is not None:
            self._reemplazar_precios(instance, precios)
        return instance


class SeccionServiceSerializer(serializers.ModelSerializer):
    """Seccion con variantes (editables aca) e items (solo lectura aca; los
    items se crean/editan por su propio endpoint para mantener chicos los
    guardados)."""

    variantes = VarianteSeccionSerializer(many=True, required=False)
    items = ItemServiceSerializer(many=True, read_only=True)
    descuento_cash_pct = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100,
        coerce_to_string=False, required=False, allow_null=True,
    )

    class Meta:
        model = SeccionService
        fields = (
            'id', 'nombre', 'nota', 'descuento_cash_pct', 'orden', 'activo',
            'variantes', 'items', 'creado', 'actualizado',
        )
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def _reemplazar_variantes(self, seccion, variantes):
        """Sincroniza las variantes conservando ids (para no perder precios).

        - Con `id`: se actualiza esa variante.
        - Sin `id`: se crea.
        - Las que no vienen en la lista se eliminan (fisico; sus precios caen
          en cascada).
        """
        ids_recibidos = []
        for orden, fila in enumerate(variantes):
            vid = fila.get('id')
            if vid and seccion.variantes.filter(id=vid).update(
                nombre=fila['nombre'], orden=fila.get('orden', orden),
            ):
                ids_recibidos.append(vid)
                continue
            nueva = VarianteSeccion.objects.create(
                seccion=seccion,
                nombre=fila['nombre'],
                orden=fila.get('orden', orden),
            )
            ids_recibidos.append(nueva.id)
        seccion.variantes.exclude(id__in=ids_recibidos).delete()

    def create(self, validated_data):
        variantes = validated_data.pop('variantes', None)
        seccion = SeccionService.objects.create(**validated_data)
        # Toda seccion necesita al menos una variante para colgar precios.
        self._reemplazar_variantes(seccion, variantes or [{'nombre': 'Estándar'}])
        return seccion

    def update(self, instance, validated_data):
        variantes = validated_data.pop('variantes', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        if variantes is not None:
            if not variantes:
                raise serializers.ValidationError(
                    {'variantes': 'La seccion necesita al menos una variante.'}
                )
            self._reemplazar_variantes(instance, variantes)
        return instance


# ===== Importacion de la lista de precios (el archivo que baja «Exportar») =====

# La lista del negocio pesa unos pocos cientos de KB; el techo deja margen de
# sobra sin dejar que una subida enorme ocupe memoria del servidor.
MAX_MB_LISTA = 10

# De que columna sale cada dato. Solo viaja cuando quien importa lo corrige a
# mano desde «Opciones avanzadas»: el numero es la columna del Excel (0 = A) y
# -1 significa "no leer ese dato de ninguna columna".
NINGUNA_COLUMNA = -1
CAMPOS_COLUMNA = {f'col_{campo}': campo for campo in CAMPOS_IMPORTACION}


def _campo_columna(obligatoria=False):
    return serializers.IntegerField(
        required=False,
        min_value=0 if obligatoria else NINGUNA_COLUMNA,
        max_value=MAX_COLUMNAS,
    )


class AnalizarListaServiceSerializer(serializers.Serializer):
    """Entrada de POST /importar/analizar/: la lista de precios a revisar."""

    archivo = serializers.FileField()
    # Los pesos son un valor derivado del dolar: entran solo si se pide.
    con_pesos = serializers.BooleanField(required=False, default=False)
    col_etiqueta = _campo_columna(obligatoria=True)
    col_seccion = _campo_columna()
    col_variante = _campo_columna()
    col_lista_usd = _campo_columna()
    col_cash_usd = _campo_columna()
    col_lista_ars = _campo_columna()
    col_cash_ars = _campo_columna()

    def validate_archivo(self, value):
        if not value.name.lower().endswith('.xlsx'):
            raise serializers.ValidationError(
                'El archivo tiene que ser un Excel .xlsx. Si lo abriste en Google '
                'Sheets, descargalo como .xlsx y volvé a subirlo.'
            )
        if value.size > MAX_MB_LISTA * 1024 * 1024:
            raise serializers.ValidationError(
                f'El archivo pesa demasiado (máximo {MAX_MB_LISTA} MB).'
            )
        return value

    def validate(self, data):
        elegidas = {
            campo: (None if data[clave] == NINGUNA_COLUMNA else data[clave])
            for clave, campo in CAMPOS_COLUMNA.items()
            if clave in data
        }
        data['columnas'] = elegidas or None
        return data


# Los cuatro precios que puede traer una fila confirmada.
PRECIOS_ITEM = (
    'precio_lista_usd', 'precio_cash_usd', 'precio_lista_ars', 'precio_cash_ars',
)


class ItemNuevoListaSerializer(serializers.Serializer):
    """El alta de una fila que la planilla trae y la lista no tiene."""

    seccion = serializers.PrimaryKeyRelatedField(
        queryset=SeccionService.objects.filter(activo=True),
    )
    etiqueta = serializers.CharField(max_length=200)
    nota = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')

    def validate_etiqueta(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('La fila necesita un nombre.')
        return value


class ItemListaServiceSerializer(serializers.Serializer):
    """Un precio confirmado: contra que item y calidad va, y que se escribe.

    Los cuatro precios son opcionales: el que no viaja no se toca, y `null`
    BORRA el valor fijado a mano (el precio vuelve a salir de la formula).
    """

    fila = serializers.IntegerField(required=False)
    item = serializers.PrimaryKeyRelatedField(
        queryset=ItemService.objects.all(), required=False, allow_null=True,
    )
    crear = ItemNuevoListaSerializer(required=False, allow_null=True)
    variante = serializers.PrimaryKeyRelatedField(queryset=VarianteSeccion.objects.all())
    precio_lista_usd = _campo_precio()
    precio_cash_usd = _campo_precio()
    precio_lista_ars = _campo_precio()
    precio_cash_ars = _campo_precio()

    def to_internal_value(self, data):
        # Excel entrega 7.14 como 7.140000000000001: se redondea ANTES de
        # validar, porque el campo guarda dos decimales y una sola fila asi
        # tiraria abajo la importacion entera.
        if isinstance(data, dict):
            cambios = {}
            for campo in PRECIOS_ITEM:
                if data.get(campo) in (None, ''):
                    continue
                redondeado = precio_planilla(data[campo])
                if redondeado is not None:
                    cambios[campo] = redondeado
            if cambios:
                data = {**data, **cambios}
        return super().to_internal_value(data)

    def validate(self, data):
        if not data.get('item') and not data.get('crear'):
            raise serializers.ValidationError(
                'Cada fila tiene que apuntar a un precio de la lista o traer el alta.'
            )
        if data.get('item') and data.get('crear'):
            raise serializers.ValidationError(
                'Una fila no puede ser a la vez un ítem existente y uno nuevo.'
            )
        if not any(campo in data for campo in PRECIOS_ITEM):
            raise serializers.ValidationError(
                'Esta fila no cambia ningún precio.'
            )
        # La calidad tiene que ser de la MISMA seccion que el item: si no, el
        # precio quedaria colgado de un bloque que no es el suyo.
        seccion = data['item'].seccion_id if data.get('item') else data['crear']['seccion'].id
        if data['variante'].seccion_id != seccion:
            raise serializers.ValidationError(
                'La calidad elegida es de otra sección.'
            )
        return data


class AplicarListaServiceSerializer(serializers.Serializer):
    """Entrada de POST /importar/aplicar/: las filas que se confirmaron."""

    items = ItemListaServiceSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('No hay ninguna fila marcada para aplicar.')
        vistos = set()
        for item in value:
            if not item.get('item'):
                continue
            clave = (item['item'].pk, item['variante'].pk)
            if clave in vistos:
                raise serializers.ValidationError(
                    f'El precio de "{item["item"].etiqueta}" viene repetido: '
                    'dejá una sola fila.'
                )
            vistos.add(clave)
        return value
