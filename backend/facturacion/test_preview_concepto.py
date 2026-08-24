"""La vista previa del front tiene que decir EXACTAMENTE lo que arma el backend.

El front calcula los renglones antes de emitir (`lib/conceptoGenerico.ts`) para
mostrar como va a salir la factura. Si esa cuenta se desviara de la del backend,
la pantalla mentiria. Este test corre los MISMOS casos contra la funcion real y
los compara contra lo que devolvio el front (medido aparte, con esos casos).
"""
from decimal import Decimal

from django.test import TestCase

from .concepto import aplicar_concepto

ITEMS = [
    {'descripcion': 'iPhone 13', 'cantidad': Decimal('1'), 'precio_unitario': Decimal('700000')},
    {'descripcion': 'iPhone 14', 'cantidad': Decimal('1'), 'precio_unitario': Decimal('700000')},
]
MIXTO = [
    {'descripcion': 'Parlante JBL', 'cantidad': Decimal('2'), 'precio_unitario': Decimal('100')},
    {'descripcion': 'Cable comun', 'cantidad': Decimal('1'), 'precio_unitario': Decimal('50')},
]

# Lo que devolvio `renglonesDeFactura` del front para estos mismos casos.
ESPERADO_DEL_FRONT = {
    'agrupado (2 x 700k)': [['Equipos de telefonia', 1, 1400000]],
    'por item (2 x 700k)': [['Equipos de telefonia', 1, 700000],
                            ['Equipos de telefonia', 1, 700000]],
    'agrupado (mixto)': [['Accesorios varios', 1, 250]],
    'por item (mixto)': [['Accesorios varios', 2, 100], ['Accesorios varios', 1, 50]],
    'sin concepto': [['Parlante JBL', 2, 100], ['Cable comun', 1, 50]],
}


def _filas(renglones):
    return [
        [r['descripcion'], float(r['cantidad']), float(r['precio_unitario'])]
        for r in renglones
    ]


class VistaPreviaCoincideConElBackendTests(TestCase):
    def test_los_cinco_casos_dan_lo_mismo(self):
        backend = {
            'agrupado (2 x 700k)': aplicar_concepto(ITEMS, 'Equipos de telefonia', agrupar=True),
            'por item (2 x 700k)': aplicar_concepto(ITEMS, 'Equipos de telefonia', agrupar=False),
            'agrupado (mixto)': aplicar_concepto(MIXTO, 'Accesorios varios', agrupar=True),
            'por item (mixto)': aplicar_concepto(MIXTO, 'Accesorios varios', agrupar=False),
            'sin concepto': MIXTO,
        }
        for caso, renglones in backend.items():
            with self.subTest(caso=caso):
                self.assertEqual(_filas(renglones), ESPERADO_DEL_FRONT[caso])

    def test_el_total_no_cambia_entre_las_dos_formas(self):
        for items in (ITEMS, MIXTO):
            total = sum(i['cantidad'] * i['precio_unitario'] for i in items)
            for agrupar in (True, False):
                renglones = aplicar_concepto(items, 'Texto', agrupar=agrupar)
                suma = sum(r['cantidad'] * r['precio_unitario'] for r in renglones)
                self.assertEqual(suma, total, f'agrupar={agrupar}')
