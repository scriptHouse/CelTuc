from decimal import Decimal

from django.test import TestCase

from .models import PlanCuota, Tarjeta


class BorradoLogicoTests(TestCase):
    def test_borrado_logico_oculta_pero_conserva(self):
        tarjeta = Tarjeta.objects.create(
            nombre='No bancarizada', categoria=Tarjeta.Categoria.EQUIPOS,
        )
        PlanCuota.objects.create(
            tarjeta=tarjeta, etiqueta='12 cuotas', cuotas=12, interes=Decimal('60'),
        )

        tarjeta.delete()  # borrado logico (no fisico)

        # El manager por defecto ya no la ve; `todos` si.
        self.assertEqual(Tarjeta.objects.count(), 0)
        self.assertEqual(Tarjeta.todos.count(), 1)
        tarjeta.refresh_from_db()
        self.assertTrue(tarjeta.borrado)
        self.assertIsNotNone(tarjeta.fecha_borrado)

    def test_restaurar_revierte_el_borrado(self):
        tarjeta = Tarjeta.objects.create(
            nombre='MercadoPago', categoria=Tarjeta.Categoria.ACCESORIOS,
        )
        tarjeta.delete()
        tarjeta.restaurar()

        self.assertEqual(Tarjeta.objects.count(), 1)
        self.assertFalse(tarjeta.borrado)
        self.assertIsNone(tarjeta.fecha_borrado)

    def test_borrado_fisico_elimina_en_cascada(self):
        tarjeta = Tarjeta.objects.create(
            nombre='Naranja', categoria=Tarjeta.Categoria.EQUIPOS,
        )
        PlanCuota.objects.create(
            tarjeta=tarjeta, etiqueta='6 cuotas', cuotas=6, interes=Decimal('35'),
        )

        tarjeta.delete(fisico=True)  # borrado real: arrastra los planes

        self.assertEqual(Tarjeta.todos.count(), 0)
        self.assertEqual(PlanCuota.todos.count(), 0)


class TarjetaSerializerTests(TestCase):
    def test_guardar_reemplaza_la_tabla_de_planes(self):
        from .serializers import TarjetaSerializer

        serializer = TarjetaSerializer(data={
            'nombre': 'MercadoPago',
            'categoria': 'accesorios',
            'planes': [
                {'etiqueta': '3 cuotas', 'cuotas': 3, 'interes': 15},
                {'etiqueta': '6 cuotas', 'cuotas': 6, 'interes': 25},
            ],
        })
        serializer.is_valid(raise_exception=True)
        tarjeta = serializer.save()
        self.assertEqual(tarjeta.planes.count(), 2)

        # Al actualizar con una sola fila, la tabla queda con esa fila.
        actualizar = TarjetaSerializer(
            tarjeta, data={'planes': [{'etiqueta': '1 pago', 'cuotas': 1, 'interes': 0}]},
            partial=True,
        )
        actualizar.is_valid(raise_exception=True)
        actualizar.save()
        self.assertEqual(tarjeta.planes.count(), 1)
        self.assertEqual(tarjeta.planes.first().etiqueta, '1 pago')
