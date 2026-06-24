from rest_framework import serializers

from .models import PlanCuota, Tarjeta


class PlanCuotaSerializer(serializers.ModelSerializer):
    """Plan de cuotas. El `interes` viaja como numero (no string) para que el
    frontend lo use directo en el calculo. El `id` es opcional: al guardar una
    tarjeta el front manda la tabla completa de planes y la reemplazamos."""

    id = serializers.IntegerField(required=False)
    interes = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=0, coerce_to_string=False,
    )

    class Meta:
        model = PlanCuota
        fields = ('id', 'etiqueta', 'cuotas', 'interes', 'orden', 'activo')

    def validate_etiqueta(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('La etiqueta es obligatoria.')
        return value


class TarjetaSerializer(serializers.ModelSerializer):
    """Tarjeta con su tabla de planes anidada (edicion tipo planilla).

    Al crear o actualizar se manda la lista completa de `planes` y se reemplaza,
    asi el editor del frontend trabaja como sobre una tabla de Excel: agrega,
    edita o borra filas y guarda todo junto.
    """

    planes = PlanCuotaSerializer(many=True, required=False)

    class Meta:
        model = Tarjeta
        fields = (
            'id', 'nombre', 'categoria', 'descripcion', 'orden', 'activa',
            'planes', 'creado', 'actualizado',
        )
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def _reemplazar_planes(self, tarjeta, planes):
        """Reescribe la tabla de planes de la tarjeta con la lista recibida."""
        tarjeta.planes.all().delete()
        PlanCuota.objects.bulk_create([
            PlanCuota(
                tarjeta=tarjeta,
                etiqueta=plan['etiqueta'],
                cuotas=plan.get('cuotas', 1),
                interes=plan.get('interes', 0),
                orden=plan.get('orden', indice),
                activo=plan.get('activo', True),
            )
            for indice, plan in enumerate(planes)
        ])

    def create(self, validated_data):
        planes = validated_data.pop('planes', [])
        tarjeta = Tarjeta.objects.create(**validated_data)
        self._reemplazar_planes(tarjeta, planes)
        return tarjeta

    def update(self, instance, validated_data):
        planes = validated_data.pop('planes', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        # Solo tocamos la tabla de planes si vino en la peticion (PATCH parcial).
        if planes is not None:
            self._reemplazar_planes(instance, planes)
        return instance
