from decimal import Decimal

from django.test import TestCase

from .models import CotizacionEquipo, ModeloEquipo, PrecioServicio, TipoServicio
from .serializers import ModeloEquipoSerializer


class SeedExcelTests(TestCase):
    """La migracion de seed carga la hoja "Cotizaciones" tal cual."""

    def test_modelos_y_tipos_sembrados(self):
        self.assertEqual(ModeloEquipo.objects.count(), 28)
        self.assertEqual(TipoServicio.objects.count(), 3)

    def test_rangos_de_toma_de_la_hoja(self):
        once = ModeloEquipo.objects.get(nombre='11')
        fila = once.cotizaciones.get(capacidad_gb=128)
        self.assertEqual((fila.precio_min, fila.precio_max), (Decimal('130'), Decimal('150')))
        # El "-" de la hoja no genera fila (11 no se toma en 256 GB).
        self.assertFalse(once.cotizaciones.filter(capacidad_gb=256).exists())

        quince_pro_max = ModeloEquipo.objects.get(nombre='15 Pro Max')
        self.assertEqual(
            list(quince_pro_max.cotizaciones.values_list('capacidad_gb', flat=True)),
            [256],
        )

    def test_precios_de_service_de_la_hoja(self):
        once = ModeloEquipo.objects.get(nombre='11')
        bateria = once.servicios.get(tipo__nombre='Cambio de batería')
        self.assertEqual(bateria.precio, Decimal('45'))

        # La serie 17 todavia no tiene precio de bateria ("-"), pero si de modulo.
        diecisiete = ModeloEquipo.objects.get(nombre='17')
        self.assertFalse(diecisiete.servicios.filter(tipo__nombre='Cambio de batería').exists())
        modulo = diecisiete.servicios.get(tipo__nombre='Cambio de módulo')
        self.assertEqual(modulo.precio, Decimal('450'))


class ModeloEquipoSerializerTests(TestCase):
    def _tipo(self, nombre='Cambio de cámara'):
        return TipoServicio.objects.create(nombre=nombre, orden=99)

    def test_guardar_reemplaza_cotizaciones_y_servicios(self):
        tipo = self._tipo()
        serializer = ModeloEquipoSerializer(data={
            'nombre': '18 Ultra',
            'cotizaciones': [
                {'capacidad_gb': 256, 'precio_min': 900, 'precio_max': 950},
                {'capacidad_gb': 512, 'precio_min': 1000, 'precio_max': 1100},
            ],
            'servicios': [{'tipo': tipo.id, 'precio': 120}],
        })
        serializer.is_valid(raise_exception=True)
        modelo = serializer.save()
        self.assertEqual(modelo.cotizaciones.count(), 2)
        self.assertEqual(modelo.servicios.count(), 1)

        # Al actualizar con una sola fila, la tabla queda con esa fila.
        actualizar = ModeloEquipoSerializer(
            modelo,
            data={'cotizaciones': [{'capacidad_gb': 256, 'precio_min': 880, 'precio_max': 930}]},
            partial=True,
        )
        actualizar.is_valid(raise_exception=True)
        actualizar.save()
        self.assertEqual(modelo.cotizaciones.count(), 1)
        self.assertEqual(modelo.cotizaciones.first().precio_min, Decimal('880'))
        # El PATCH parcial no toco los servicios.
        self.assertEqual(modelo.servicios.count(), 1)

    def test_precio_max_no_puede_ser_menor_al_min(self):
        serializer = ModeloEquipoSerializer(data={
            'nombre': '18',
            'cotizaciones': [{'capacidad_gb': 128, 'precio_min': 500, 'precio_max': 400}],
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('cotizaciones', serializer.errors)

    def test_capacidades_repetidas_invalidas(self):
        serializer = ModeloEquipoSerializer(data={
            'nombre': '18',
            'cotizaciones': [
                {'capacidad_gb': 128, 'precio_min': 100, 'precio_max': 120},
                {'capacidad_gb': 128, 'precio_min': 110, 'precio_max': 130},
            ],
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('cotizaciones', serializer.errors)

    def test_nombre_duplicado_invalido(self):
        serializer = ModeloEquipoSerializer(data={'nombre': '13 pro'})  # ya existe (case-insensitive)
        self.assertFalse(serializer.is_valid())
        self.assertIn('nombre', serializer.errors)

    def test_capacidad_label(self):
        modelo = ModeloEquipo.objects.get(nombre='11')
        fila = CotizacionEquipo(modelo=modelo, capacidad_gb=1024, precio_min=1, precio_max=2)
        self.assertEqual(fila.capacidad_label, '1 TB')
        fila.capacidad_gb = 256
        self.assertEqual(fila.capacidad_label, '256 GB')


class TipoServicioBorradoTests(TestCase):
    def test_borrar_tipo_oculta_sus_precios_en_los_modelos(self):
        from .views import _modelos_queryset

        tapa = TipoServicio.objects.get(nombre='Cambio de tapa')
        tapa.delete()  # borrado logico

        once = _modelos_queryset().get(nombre='11')
        nombres = [p.tipo.nombre for p in once.servicios.all()]
        self.assertNotIn('Cambio de tapa', nombres)
        # Fisicamente la fila sigue existiendo (se limpia al proximo guardado).
        self.assertTrue(
            PrecioServicio.objects.filter(modelo__nombre='11', tipo=tapa).exists()
        )
