from rest_framework import serializers

from precios_service.models import Dispositivo

from .models import CotizacionEquipo, ModeloEquipo, PrecioServicio, TipoServicio


class CotizacionEquipoSerializer(serializers.ModelSerializer):
    """Rango de toma por capacidad. Los precios viajan como numero (no string)
    para que el frontend los use directo. El `id` es opcional: al guardar un
    modelo el front manda la tabla completa y la reemplazamos."""

    id = serializers.IntegerField(required=False)
    precio_min = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, coerce_to_string=False,
    )
    precio_max = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, coerce_to_string=False,
    )
    capacidad_label = serializers.ReadOnlyField()

    class Meta:
        model = CotizacionEquipo
        fields = ('id', 'capacidad_gb', 'capacidad_label', 'precio_min', 'precio_max')

    def validate(self, data):
        if data['precio_max'] < data['precio_min']:
            raise serializers.ValidationError('El precio maximo no puede ser menor que el minimo.')
        return data


class PrecioServicioSerializer(serializers.ModelSerializer):
    """Precio de un tipo de service para el modelo. `tipo` es el id del
    TipoServicio; `tipo_nombre` acompana para mostrar sin otra consulta."""

    id = serializers.IntegerField(required=False)
    tipo = serializers.PrimaryKeyRelatedField(queryset=TipoServicio.objects.all())
    tipo_nombre = serializers.CharField(source='tipo.nombre', read_only=True)
    precio = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, coerce_to_string=False,
    )

    class Meta:
        model = PrecioServicio
        fields = ('id', 'tipo', 'tipo_nombre', 'precio')


class ModeloEquipoSerializer(serializers.ModelSerializer):
    """Modelo con sus rangos de toma y precios de service anidados.

    Igual que las tarjetas del simulador: al crear o actualizar se manda la
    lista completa de `cotizaciones` y/o `servicios` y se reemplaza, asi el
    editor del frontend trabaja como sobre la planilla original.
    """

    cotizaciones = CotizacionEquipoSerializer(many=True, required=False)
    servicios = PrecioServicioSerializer(many=True, required=False)
    nombre_completo = serializers.ReadOnlyField()
    dispositivo = serializers.PrimaryKeyRelatedField(
        queryset=Dispositivo.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = ModeloEquipo
        fields = (
            'id', 'marca', 'nombre', 'nombre_completo', 'dispositivo', 'orden', 'activo',
            'cotizaciones', 'servicios', 'creado', 'actualizado',
        )
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def validate_marca(self, value):
        return value.strip()

    def validate_cotizaciones(self, value):
        capacidades = [c['capacidad_gb'] for c in value]
        if len(capacidades) != len(set(capacidades)):
            raise serializers.ValidationError('Hay capacidades repetidas.')
        return value

    def validate_servicios(self, value):
        tipos = [s['tipo'] for s in value]
        if len(tipos) != len(set(tipos)):
            raise serializers.ValidationError('Hay tipos de service repetidos.')
        return value

    def validate(self, data):
        # Evita dos modelos vivos con el mismo nombre (la restriccion de la base
        # es el respaldo; aca damos un error legible y case-insensitive).
        marca = data.get('marca', self.instance.marca if self.instance else 'iPhone')
        nombre = data.get('nombre', self.instance.nombre if self.instance else '')
        repetido = ModeloEquipo.objects.filter(marca__iexact=marca, nombre__iexact=nombre)
        if self.instance is not None:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            raise serializers.ValidationError({'nombre': 'Ya existe un modelo con ese nombre.'})
        return data

    def _reemplazar_cotizaciones(self, modelo, cotizaciones):
        """Reescribe los rangos de toma del modelo con la lista recibida."""
        modelo.cotizaciones.all().delete()
        CotizacionEquipo.objects.bulk_create([
            CotizacionEquipo(
                modelo=modelo,
                capacidad_gb=fila['capacidad_gb'],
                precio_min=fila['precio_min'],
                precio_max=fila['precio_max'],
            )
            for fila in cotizaciones
        ])

    def _reemplazar_servicios(self, modelo, servicios):
        """Reescribe los precios de service del modelo con la lista recibida."""
        modelo.servicios.all().delete()
        PrecioServicio.objects.bulk_create([
            PrecioServicio(
                modelo=modelo,
                tipo=fila['tipo'],
                precio=fila['precio'],
            )
            for fila in servicios
        ])

    def create(self, validated_data):
        cotizaciones = validated_data.pop('cotizaciones', [])
        servicios = validated_data.pop('servicios', [])
        # Puente automatico al catalogo de equipos: si no vino explicito y hay
        # un Dispositivo con el mismo nombre, se vincula solo (asi el modelo
        # nuevo aparece en la Ficha de equipo sin tocar el editor).
        if 'dispositivo' not in validated_data:
            nombre_completo = f"{validated_data.get('marca', 'iPhone')} {validated_data['nombre']}".strip()
            validated_data['dispositivo'] = Dispositivo.objects.filter(
                nombre__iexact=nombre_completo,
            ).first()
        modelo = ModeloEquipo.objects.create(**validated_data)
        self._reemplazar_cotizaciones(modelo, cotizaciones)
        self._reemplazar_servicios(modelo, servicios)
        return modelo

    def update(self, instance, validated_data):
        cotizaciones = validated_data.pop('cotizaciones', None)
        servicios = validated_data.pop('servicios', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        # Solo tocamos las tablas anidadas si vinieron en la peticion (PATCH parcial).
        if cotizaciones is not None:
            self._reemplazar_cotizaciones(instance, cotizaciones)
        if servicios is not None:
            self._reemplazar_servicios(instance, servicios)
        return instance


class TipoServicioSerializer(serializers.ModelSerializer):
    """Tipo de service del catalogo (cambio de bateria, de modulo, ...)."""

    class Meta:
        model = TipoServicio
        fields = ('id', 'nombre', 'orden', 'activo', 'creado', 'actualizado')
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value
