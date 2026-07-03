from rest_framework import serializers

from .models import (
    ConfiguracionService,
    ItemService,
    PrecioItemService,
    SeccionService,
    VarianteSeccion,
    resolver_precios,
)


def _campo_precio(**extra):
    return serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0,
        coerce_to_string=False, required=False, allow_null=True, **extra,
    )


class ConfiguracionServiceSerializer(serializers.ModelSerializer):
    """Parametros globales. Cambiar el dolar recalcula toda la lista derivada."""

    dolar = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, coerce_to_string=False,
    )
    descuento_cash_pct = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100, coerce_to_string=False,
    )

    class Meta:
        model = ConfiguracionService
        fields = ('dolar', 'descuento_cash_pct', 'redondeo_ars', 'actualizado')
        read_only_fields = ('actualizado',)


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
    precios = PrecioItemServiceSerializer(many=True, required=False)

    class Meta:
        model = ItemService
        fields = ('id', 'seccion', 'etiqueta', 'nota', 'orden', 'activo', 'precios')

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
        item = ItemService.objects.create(**validated_data)
        self._reemplazar_precios(item, precios)
        return item

    def update(self, instance, validated_data):
        precios = validated_data.pop('precios', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
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
