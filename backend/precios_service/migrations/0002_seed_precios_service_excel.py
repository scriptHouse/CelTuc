# -*- coding: utf-8 -*-
"""Importa la hoja "Precios Service" del Excel del negocio.

GENERADO por script leyendo el Excel celda por celda. Para cada precio se
comparo el valor real contra la formula de la lista (dolar 1550, cash -20 %
o el descuento propio de la seccion, pesos redondeados al millar PARA ARRIBA):

- Si coincidia, se guarda NULL y el sistema lo deriva (cambiar el dolar en la
  configuracion actualiza toda la lista).
- Si diferia (baterias retocadas a mano, promos, variantes solo en pesos), se
  guarda como override, igual que estaba en la hoja.

Quedan afuera los bloques internos de la derecha de la hoja ("NO SE GUIEN DE
ESTA LISTA", "COSTO SANTO", "PRECIOS VIEJOS"): la propia hoja pide no usarlos.

Idempotente: cada seccion se identifica por nombre; si ya existe se le
reemplazan variantes e items con los del Excel.

Resumen de lo importado: 295 items, 386 precios
(226 valores con override manual).
"""
from decimal import Decimal

from django.db import migrations


def D(valor):
    return Decimal(valor) if valor is not None else None


DATA = {
 "secciones": [
  {
   "nombre": "Baterías",
   "nota": "SI TIENE EL TEMPLADO ROTO EL CLIENTE DEBERA REEMPLAZARLO YA QUE NO SE PODRA ABRIR EL IPHONE. * SI EL CLIENTE QUIERE QUE QUEDE SIN EL CARTEL , DEBE TRAER EL EQUIPO DE FABRICA Y SIN CUENTA , LA CASA NO SE RESPONABILIZA POR PERDIDA DE DATOS O COPIA DE SEGURIDAD. Si el equipo ingresa CON CARTEL DE QUE NO SE PUDO VERIFICAR saldria al 100% pero SI O SI con ese mismo cartel.",
   "descuento_cash_pct": None,
   "variantes": [
    "Queda al 100 % pero NO reconoce la batería como pieza original",
    "Queda al 100 % y reconoce la batería como pieza original"
   ],
   "items": [
    {
     "etiqueta": "6 / 6PLUS / 6S / 6S PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "40",
       "31",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "7 / 7 PLUS / 8 / 8 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "40",
       "31",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "X / XR / XS / XS MAX / SE 2020",
     "nota": "",
     "precios": [
      [
       0,
       "70",
       "51",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11",
     "nota": "",
     "precios": [
      [
       0,
       "70",
       "51",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11PRO",
     "nota": "",
     "precios": [
      [
       0,
       "80",
       "62",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "80",
       "62",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 MINI / 12 / 12 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "90",
       "67",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "180000",
       "152000"
      ]
     ]
    },
    {
     "etiqueta": "12PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "90",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "140000",
       "152000"
      ]
     ]
    },
    {
     "etiqueta": "13 MINI / 13 / SE 2022",
     "nota": "",
     "precios": [
      [
       0,
       "90",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "180000",
       "152000"
      ]
     ]
    },
    {
     "etiqueta": "13 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "100",
       "77",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "195000",
       "164000"
      ]
     ]
    },
    {
     "etiqueta": "13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "100",
       "77",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "195000",
       "164000"
      ]
     ]
    },
    {
     "etiqueta": "14 / 14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "90",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "180000",
       "152000"
      ]
     ]
    },
    {
     "etiqueta": "14 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "100",
       "82",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "195000",
       "164000"
      ]
     ]
    },
    {
     "etiqueta": "14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "100",
       "82",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "195000",
       "164000"
      ]
     ]
    },
    {
     "etiqueta": "15",
     "nota": "",
     "precios": [
      [
       0,
       "120",
       "92",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "226000",
       "189000"
      ]
     ]
    },
    {
     "etiqueta": "15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "120",
       "93",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "226000",
       "189000"
      ]
     ]
    },
    {
     "etiqueta": "15 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "130",
       "102",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "242000",
       "202000"
      ]
     ]
    },
    {
     "etiqueta": "15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "130",
       "102",
       None,
       None
      ],
      [
       1,
       None,
       None,
       "242000",
       "202000"
      ]
     ]
    },
    {
     "etiqueta": "16E",
     "nota": "",
     "precios": [
      [
       0,
       "130",
       "102",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16",
     "nota": "",
     "precios": [
      [
       0,
       "140",
       "113",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "150",
       "123",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "150",
       "123",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "160",
       "133",
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Cambio de glass de pantalla",
   "nota": "Demora 72-96 hs por el secado en el horno. Lean condiciones en hoja DATA SERVICE.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "LINEA 12",
     "nota": "",
     "precios": [
      [
       0,
       "180",
       "150",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 13 MINI Y 13",
     "nota": "",
     "precios": [
      [
       0,
       "192",
       "160",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 13 PRO Y 13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "216",
       "180",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 14 Y 14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "216",
       "180",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 14 PRO Y 14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "240",
       "200",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 15 Y 15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "240",
       "200",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 15 PRO Y 15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "300",
       "250",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 16 Y 16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "300",
       "250",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 16 PRO Y 16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "360",
       "300",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 17 Y 17 AIR",
     "nota": "",
     "precios": [
      [
       0,
       "360",
       "300",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "IPHONE 17 PRO Y 17 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "360",
       "300",
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Módulos",
   "nota": "Las AO pueden ser usadas a veces ya que son extraidas de equipos. ‼️En este modelo de iPhone al reemplazar la pantalla el mismo arroja un mensaje de “Pieza Desconocida” sea CC o CO o AO ( si esta ultima es usada no quedaria el mensaje ) ya que la placa el equipo va seriada con la pantalla de fábrica, ese mensaje no afecta en el uso. Existe un procedimiento para eliminar ese mensaje a través de un trasplante del integrado original a la pantalla nueva",
   "descuento_cash_pct": None,
   "variantes": [
    "Calidad certificada (LCD)",
    "Calidad original (OLED)",
    "Apple Original"
   ],
   "items": [
    {
     "etiqueta": "6G / 6PLUS / 6S / 6S PLUS( SOLO BLACK) / SE 2016",
     "nota": "",
     "precios": [
      [
       1,
       "61.2",
       "49",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "7G / 7 PLUS / 8G / 8 PLUS",
     "nota": "",
     "precios": [
      [
       1,
       "61.2",
       "49",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "X / XS",
     "nota": "",
     "precios": [
      [
       0,
       "91.8",
       "74",
       None,
       None
      ],
      [
       1,
       "132.6",
       "107",
       None,
       None
      ],
      [
       2,
       "240",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XR",
     "nota": "",
     "precios": [
      [
       1,
       "91.8",
       "74",
       None,
       None
      ],
      [
       2,
       "160",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS MAX",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       "82",
       None,
       None
      ],
      [
       1,
       "153",
       "123",
       None,
       None
      ],
      [
       2,
       "260",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SE 2020",
     "nota": "",
     "precios": [
      [
       1,
       "81.6",
       "66",
       None,
       None
      ],
      [
       2,
       "160",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11",
     "nota": "",
     "precios": [
      [
       1,
       "112.2",
       "90",
       None,
       None
      ],
      [
       2,
       "200",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       "98",
       None,
       None
      ],
      [
       1,
       "173.4",
       "139",
       None,
       None
      ],
      [
       2,
       "260",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       "107",
       None,
       None
      ],
      [
       1,
       "183.6",
       "147",
       None,
       None
      ],
      [
       2,
       "270",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       "123",
       None,
       None
      ],
      [
       1,
       "204",
       "164",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 / 12 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       "123",
       None,
       None
      ],
      [
       1,
       "193.8",
       "156",
       None,
       None
      ],
      [
       2,
       "300",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "183.6",
       "147",
       None,
       None
      ],
      [
       1,
       "234.6",
       "188",
       None,
       None
      ],
      [
       2,
       "350",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "183.6",
       "147",
       None,
       None
      ],
      [
       1,
       "224.4",
       "180",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SE 2022",
     "nota": "",
     "precios": [
      [
       1,
       "102",
       "82",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       "123",
       None,
       None
      ],
      [
       1,
       "204",
       "164",
       None,
       None
      ],
      [
       2,
       "340",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "193.8",
       "156",
       None,
       None
      ],
      [
       1,
       "255",
       None,
       None,
       None
      ],
      [
       2,
       "410",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       "164",
       None,
       None
      ],
      [
       1,
       "275.4",
       "221",
       None,
       None
      ],
      [
       2,
       "450",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14",
     "nota": "",
     "precios": [
      [
       0,
       "173.4",
       "139",
       None,
       None
      ],
      [
       1,
       "234.6",
       "188",
       None,
       None
      ],
      [
       2,
       "400",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "183.6",
       "147",
       None,
       None
      ],
      [
       1,
       "265.2",
       "213",
       None,
       None
      ],
      [
       2,
       "400",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "193.8",
       "156",
       None,
       None
      ],
      [
       1,
       "285.6",
       "229",
       None,
       None
      ],
      [
       2,
       "500",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "234.6",
       "188",
       None,
       None
      ],
      [
       1,
       "312.14",
       "250",
       None,
       None
      ],
      [
       2,
       "550",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "193.8",
       "156",
       None,
       None
      ],
      [
       1,
       "265.2",
       "213",
       None,
       None
      ],
      [
       2,
       "420",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PLUS ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "214.2",
       "172",
       None,
       None
      ],
      [
       1,
       "336.6",
       "270",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "214.2",
       "172",
       None,
       None
      ],
      [
       1,
       "336.6",
       "270",
       None,
       None
      ],
      [
       2,
       "520",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO MAX ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "234.6",
       "188",
       None,
       None
      ],
      [
       1,
       "357",
       "286",
       None,
       None
      ],
      [
       2,
       "600",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16E",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       "180",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       "180",
       None,
       None
      ],
      [
       1,
       "357",
       "286",
       None,
       None
      ],
      [
       2,
       "530",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "285.6",
       "229",
       None,
       None
      ],
      [
       1,
       "408",
       "327",
       None,
       None
      ],
      [
       2,
       "620",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "295.8",
       "237",
       None,
       None
      ],
      [
       1,
       "438.6",
       "351",
       None,
       None
      ],
      [
       2,
       "620",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO MAX ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "306",
       "245",
       None,
       None
      ],
      [
       1,
       "459",
       "368",
       None,
       None
      ],
      [
       2,
       "650",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       1,
       "438.6",
       "351",
       None,
       None
      ],
      [
       2,
       "600",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "408",
       "327",
       None,
       None
      ],
      [
       1,
       "510",
       None,
       None,
       None
      ],
      [
       2,
       "820",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO MAX ( AO A PEDIDO )",
     "nota": "",
     "precios": [
      [
       0,
       "459",
       "368",
       None,
       None
      ],
      [
       1,
       "561",
       "449",
       None,
       None
      ],
      [
       2,
       "940",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Quitar mensaje \"pieza desconocida\"",
   "nota": "Demora 48-72 hs. Aplica al cambio de módulo: la placa va seriada con la pantalla de fábrica; se trasplanta el integrado original a la pantalla nueva.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "11",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "60000",
       "60000"
      ]
     ]
    },
    {
     "etiqueta": "11 PRO",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "60000",
       "60000"
      ]
     ]
    },
    {
     "etiqueta": "11 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "60000",
       "60000"
      ]
     ]
    },
    {
     "etiqueta": "12 MINI",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "60000",
       "60000"
      ]
     ]
    },
    {
     "etiqueta": "12 / 12 PRO",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "60000",
       "60000"
      ]
     ]
    },
    {
     "etiqueta": "12 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "60000",
       "60000"
      ]
     ]
    },
    {
     "etiqueta": "13 MINI",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "60000",
       "60000"
      ]
     ]
    },
    {
     "etiqueta": "13",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "13 PRO",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "14",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "14 PRO",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "15",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "15 PRO",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "70000",
       "70000"
      ]
     ]
    },
    {
     "etiqueta": "16E",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    },
    {
     "etiqueta": "16",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    },
    {
     "etiqueta": "16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    },
    {
     "etiqueta": "16 PRO",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    },
    {
     "etiqueta": "16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    },
    {
     "etiqueta": "17",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    },
    {
     "etiqueta": "17 PRO",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    },
    {
     "etiqueta": "17 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       None,
       None,
       "100000",
       "100000"
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Reparaciones generales",
   "nota": "EN CASO QUE EL DIAGNOSTICO REQUIERA BQ Y EL CLIENTE NO QUIERA REPARAR DEBERA SOLO ABONAR EL BQ. BQ CONSISTE EN EL DESARMADO LIMPIEZA Y DESCONTAMINACION DEL EQUIPO.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "DIAGNOSTICO HASTA LINEA 11 (24-72HS)",
     "nota": "",
     "precios": [
      [
       0,
       "20.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "DIAGNOSTICO LINEA 12 - LINEA 14 (24-72HS)",
     "nota": "",
     "precios": [
      [
       0,
       "32.64",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "DIAGNOSTICO LINEA 15 - LINEA 16 (24-72HS)",
     "nota": "",
     "precios": [
      [
       0,
       "43.86",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "INTENTO REPARACION DE PLACA TODOS LOS MODELOS",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SOFTWARE IPHONE (EN EL DIA)",
     "nota": "",
     "precios": [
      [
       0,
       "40",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SOFTWARE IPAD (EN EL DIA)",
     "nota": "",
     "precios": [
      [
       0,
       "80",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SOFTWARE MAC OS (5 DIAS HABILES O MAS)",
     "nota": "",
     "precios": [
      [
       0,
       "200",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "BAÑO QUIMICO HASTA LINEA 11 (24-72HS)",
     "nota": "",
     "precios": [
      [
       0,
       "40.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "BAÑO QUIMICO LINEA 12 - LINEA 14 (24-72HS)",
     "nota": "",
     "precios": [
      [
       0,
       "53.04",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "BAÑO QUIMICO LINEA 15 - LINEA 16 (24-72HS)",
     "nota": "",
     "precios": [
      [
       0,
       "71.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "BAÑO QUIMICO LINEA 17 (24-72HS)",
     "nota": "",
     "precios": [
      [
       0,
       "91.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LIMPIEZA FULL (EN EL MOMENTO)",
     "nota": "",
     "precios": [
      [
       0,
       "20.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LIMPIEZA LOCALIZADA (EN EL MOMENTO)",
     "nota": "",
     "precios": [
      [
       0,
       "11.22",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "TORNILLOS PENTALOBE HASTA LINEA 14",
     "nota": "",
     "precios": [
      [
       0,
       "17.34",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "TORNILLOS PENTALOBE LINEA 15 - LINEA 17",
     "nota": "",
     "precios": [
      [
       0,
       "22.44",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Reparación de placa",
   "nota": "Demora 10-15 días hábiles.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "7 / 7+",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "8 / 8+",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE X / SE 2020",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 / SE 2022",
     "nota": "",
     "precios": [
      [
       0,
       "163.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO / 11 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "193.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 / 12 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO / 12 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "234.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 / 13 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "255",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO / 13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "285.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 / 14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "316.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO / 14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "387.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 / 15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "397.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO / 15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "448.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16E / 16 / 16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "448.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO / 16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "561",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 / 17 AIR",
     "nota": "",
     "precios": [
      [
       0,
       "612",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO / 17 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "816",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Reparación de Face ID",
   "nota": "Demora 10-15 días hábiles.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "LINEA 11",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 12",
     "nota": "",
     "precios": [
      [
       0,
       "183.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 13",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 14",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 15",
     "nota": "",
     "precios": [
      [
       0,
       "234.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 16",
     "nota": "",
     "precios": [
      [
       0,
       "265.2",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Cámara trasera",
   "nota": "En el día, pero consultar disponibilidad. Serie 11 en adelante incluye recuperación de Face ID.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "7",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "7+",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "8",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "8+",
     "nota": "",
     "precios": [
      [
       0,
       "71.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "X",
     "nota": "",
     "precios": [
      [
       0,
       "91.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XR",
     "nota": "",
     "precios": [
      [
       0,
       "91.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS MAX",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11",
     "nota": "",
     "precios": [
      [
       0,
       "81.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "142.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "142.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "183.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "193.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "193.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14",
     "nota": "",
     "precios": [
      [
       0,
       "173.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "183.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16E",
     "nota": "",
     "precios": [
      [
       0,
       "137.7",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16",
     "nota": "",
     "precios": [
      [
       0,
       "214.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17",
     "nota": "",
     "precios": [
      [
       0,
       "255",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 AIR",
     "nota": "",
     "precios": [
      [
       0,
       "255",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "306",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "306",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Cámara selfie",
   "nota": "En el día, pero consultar disponibilidad. Recupera la función de cámara selfie pero pierde Face ID; con reparación de Face ID existe riesgo de que no sea recuperable.",
   "descuento_cash_pct": None,
   "variantes": [
    "Cambio (pierde Face ID)",
    "Cambio + reparación de Face ID"
   ],
   "items": [
    {
     "etiqueta": "7",
     "nota": "",
     "precios": [
      [
       0,
       "25.5",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       None,
       "120000"
      ]
     ]
    },
    {
     "etiqueta": "7+",
     "nota": "",
     "precios": [
      [
       0,
       "33.66",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       None,
       "180000"
      ]
     ]
    },
    {
     "etiqueta": "8",
     "nota": "",
     "precios": [
      [
       0,
       "33.66",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       None,
       "230000"
      ]
     ]
    },
    {
     "etiqueta": "8+",
     "nota": "",
     "precios": [
      [
       0,
       "38.76",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       None,
       "280000"
      ]
     ]
    },
    {
     "etiqueta": "X",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XR",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS / SE 2020",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS MAX",
     "nota": "",
     "precios": [
      [
       0,
       "51",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11",
     "nota": "",
     "precios": [
      [
       0,
       "57.12",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "209000",
       "167200"
      ]
     ]
    },
    {
     "etiqueta": "11 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "76.5",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "239000",
       "191200"
      ]
     ]
    },
    {
     "etiqueta": "11 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "76.5",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "239000",
       "191200"
      ]
     ]
    },
    {
     "etiqueta": "12 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "76.5",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "299000",
       "239200"
      ]
     ]
    },
    {
     "etiqueta": "12",
     "nota": "",
     "precios": [
      [
       0,
       "76.5",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "299000",
       "239200"
      ]
     ]
    },
    {
     "etiqueta": "12 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "76.5",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "299000",
       "239200"
      ]
     ]
    },
    {
     "etiqueta": "12 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "88.74",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "318000",
       "254400"
      ]
     ]
    },
    {
     "etiqueta": "13 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "88.74",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "318000",
       "254400"
      ]
     ]
    },
    {
     "etiqueta": "13",
     "nota": "",
     "precios": [
      [
       0,
       "88.74",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "318000",
       "254400"
      ]
     ]
    },
    {
     "etiqueta": "13 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "370000",
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "386000",
       "308800"
      ]
     ]
    },
    {
     "etiqueta": "14",
     "nota": "",
     "precios": [
      [
       0,
       "142.8",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "402000",
       "321600"
      ]
     ]
    },
    {
     "etiqueta": "14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "418000",
       "334400"
      ]
     ]
    },
    {
     "etiqueta": "14 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "418000",
       "334400"
      ]
     ]
    },
    {
     "etiqueta": "14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "418000",
       "334400"
      ]
     ]
    },
    {
     "etiqueta": "15",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "468000",
       "374400"
      ]
     ]
    },
    {
     "etiqueta": "15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "468000",
       "374400"
      ]
     ]
    },
    {
     "etiqueta": "15 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "163.2",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "483000",
       "386400"
      ]
     ]
    },
    {
     "etiqueta": "15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "163.2",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "483000",
       "386400"
      ]
     ]
    },
    {
     "etiqueta": "16E",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "518000",
       "414400"
      ]
     ]
    },
    {
     "etiqueta": "16",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "518000",
       "414400"
      ]
     ]
    },
    {
     "etiqueta": "16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "163.2",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "533000",
       "426400"
      ]
     ]
    },
    {
     "etiqueta": "16 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "163.2",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "533000",
       "426400"
      ]
     ]
    },
    {
     "etiqueta": "16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "173.4",
       None,
       None,
       None
      ],
      [
       1,
       None,
       None,
       "549000",
       "439200"
      ]
     ]
    },
    {
     "etiqueta": "17",
     "nota": "",
     "precios": [
      [
       0,
       "244.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 AIR",
     "nota": "",
     "precios": [
      [
       0,
       "244.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "255",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "255",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Flex de carga",
   "nota": "En el día, pero consultar disponibilidad.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "X",
     "nota": "",
     "precios": [
      [
       0,
       "61.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XR",
     "nota": "",
     "precios": [
      [
       0,
       "61.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS / SE 2020",
     "nota": "",
     "precios": [
      [
       0,
       "71.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS MAX",
     "nota": "",
     "precios": [
      [
       0,
       "81.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11",
     "nota": "",
     "precios": [
      [
       0,
       "81.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16E",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 AIR",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Glass de cámara",
   "nota": "En el día, pero consultar disponibilidad. Precio unitario: consultar por más de un vidrio.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "X",
     "nota": "",
     "precios": [
      [
       0,
       "31.62",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XR",
     "nota": "",
     "precios": [
      [
       0,
       "31.62",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS",
     "nota": "",
     "precios": [
      [
       0,
       "31.62",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "XS MAX",
     "nota": "",
     "precios": [
      [
       0,
       "31.62",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11",
     "nota": "",
     "precios": [
      [
       0,
       "44.88",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "50",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "50",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "56.1",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12",
     "nota": "",
     "precios": [
      [
       0,
       "56.1",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "56.1",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "56.1",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 MINI",
     "nota": "",
     "precios": [
      [
       0,
       "63.24",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13",
     "nota": "",
     "precios": [
      [
       0,
       "63.24",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "71.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "71.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14",
     "nota": "",
     "precios": [
      [
       0,
       "63.24",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "76.5",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "81.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15",
     "nota": "",
     "precios": [
      [
       0,
       "81.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "89.76",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "93.84",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "93.84",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16E",
     "nota": "",
     "precios": [
      [
       0,
       "89.76",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16",
     "nota": "",
     "precios": [
      [
       0,
       "89.76",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PLUS",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 AIR",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "17 PRO MAX",
     "nota": "",
     "precios": [
      [
       0,
       "132.6",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Audio oído",
   "nota": "Demora 24-72 hs.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "LINEA 11",
     "nota": "",
     "precios": [
      [
       0,
       "71.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 12",
     "nota": "",
     "precios": [
      [
       0,
       "81.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 13",
     "nota": "",
     "precios": [
      [
       0,
       "91.8",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 14",
     "nota": "",
     "precios": [
      [
       0,
       "102",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 15",
     "nota": "",
     "precios": [
      [
       0,
       "112.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 16",
     "nota": "",
     "precios": [
      [
       0,
       "122.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "LINEA 17",
     "nota": "",
     "precios": [
      [
       0,
       "183.6",
       None,
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Tapa trasera",
   "nota": "Hasta 14 Pro Max con láser: 2-3 días. Línea 15 en adelante sin láser: 12-36 hs. Promo 30 % OFF en cash $ (junio).",
   "descuento_cash_pct": "30",
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "11",
     "nota": "CON LASER 2-3 DIAS",
     "precios": [
      [
       0,
       "71.4",
       "57.12",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "11 PRO / 11 PRO MAX",
     "nota": "CON LASER 2-3 DIAS",
     "precios": [
      [
       0,
       "81.6",
       "65.28",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 MINI / 12",
     "nota": "CON LASER 2-3 DIAS",
     "precios": [
      [
       0,
       "91.8",
       "73.44",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "12 PRO / 12 PRO MAX",
     "nota": "CON LASER 2-3 DIAS",
     "precios": [
      [
       0,
       "91.8",
       "73.44",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 MINI / 13",
     "nota": "CON LASER 2-3 DIAS",
     "precios": [
      [
       0,
       "91.8",
       "73.44",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "13 PRO / 13 PRO MAX",
     "nota": "CON LASER 2-3 DIAS",
     "precios": [
      [
       0,
       "112.2",
       "89.76",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 / 14 PLUS",
     "nota": "SIN LASER 12-36HS",
     "precios": [
      [
       0,
       "112.2",
       "89.76",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "14 PRO / 14 PRO MAX",
     "nota": "CON LASER 2-3 DIAS",
     "precios": [
      [
       0,
       "112.2",
       "89.76",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 / 15 PLUS",
     "nota": "SIN LASER 12-36HS",
     "precios": [
      [
       0,
       "112.2",
       "89.76",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "15 PRO / 15 PRO MAX",
     "nota": "SIN LASER 12-36HS",
     "precios": [
      [
       0,
       "112.2",
       "89.76",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16E / 16 / 16 PLUS",
     "nota": "SIN LASER 12-36HS",
     "precios": [
      [
       0,
       "138.72",
       "110.98",
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "16 PRO / 16 PRO MAX",
     "nota": "SIN LASER 12-36HS",
     "precios": [
      [
       0,
       "150.96",
       "120.77",
       None,
       None
      ]
     ]
    }
   ]
  },
  {
   "nombre": "Módulo Apple Watch",
   "nota": "Original, a pedido. Demora 5-10 días hábiles.",
   "descuento_cash_pct": None,
   "variantes": [
    "Estándar"
   ],
   "items": [
    {
     "etiqueta": "SERIE 5 / SE 1ra GEN 40MM",
     "nota": "",
     "precios": [
      [
       0,
       "188.7",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 5 / SE 1RA GEN 44MM",
     "nota": "",
     "precios": [
      [
       0,
       "229.5",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 6 40MM",
     "nota": "",
     "precios": [
      [
       0,
       "153",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 6 44MM",
     "nota": "",
     "precios": [
      [
       0,
       "229.5",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 7 41MM",
     "nota": "",
     "precios": [
      [
       0,
       "229.5",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 7 45MM",
     "nota": "",
     "precios": [
      [
       0,
       "204",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 8 41MM",
     "nota": "",
     "precios": [
      [
       0,
       "224.4",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 9 41MM",
     "nota": "",
     "precios": [
      [
       0,
       "285.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "SERIE 9 45MM",
     "nota": "",
     "precios": [
      [
       0,
       "285.6",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "ULTRA 1 49MM",
     "nota": "",
     "precios": [
      [
       0,
       "316.2",
       None,
       None,
       None
      ]
     ]
    },
    {
     "etiqueta": "ULTRA 2 49MM",
     "nota": "",
     "precios": [
      [
       0,
       "377.4",
       None,
       None,
       None
      ]
     ]
    }
   ]
  }
 ]
}


def sembrar(apps, schema_editor):
    ConfiguracionService = apps.get_model('precios_service', 'ConfiguracionService')
    SeccionService = apps.get_model('precios_service', 'SeccionService')
    VarianteSeccion = apps.get_model('precios_service', 'VarianteSeccion')
    ItemService = apps.get_model('precios_service', 'ItemService')
    PrecioItemService = apps.get_model('precios_service', 'PrecioItemService')

    # Parametros de la hoja (celda H7 = dolar; los cash son -20 %).
    ConfiguracionService.objects.get_or_create(pk=1, defaults={
        'dolar': Decimal('1550'),
        'descuento_cash_pct': Decimal('20'),
        'redondeo_ars': 1000,
    })

    for orden_seccion, data in enumerate(DATA['secciones']):
        seccion, _ = SeccionService.objects.update_or_create(
            nombre=data['nombre'],
            defaults={
                'nota': data['nota'],
                'descuento_cash_pct': D(data['descuento_cash_pct']),
                'orden': orden_seccion,
                'activo': True,
                'borrado': False,
            },
        )

        # Reemplazo total de variantes e items (borrado fisico de lo viejo).
        seccion.items.all().delete()
        seccion.variantes.all().delete()

        variantes = [
            VarianteSeccion.objects.create(seccion=seccion, nombre=nombre, orden=orden)
            for orden, nombre in enumerate(data['variantes'])
        ]

        for orden_item, fila in enumerate(data['items']):
            item = ItemService.objects.create(
                seccion=seccion,
                etiqueta=fila['etiqueta'],
                nota=fila['nota'],
                orden=orden_item,
                activo=True,
            )
            PrecioItemService.objects.bulk_create([
                PrecioItemService(
                    item=item,
                    variante=variantes[precio[0]],
                    precio_lista_usd=D(precio[1]),
                    precio_cash_usd=D(precio[2]),
                    precio_lista_ars=D(precio[3]),
                    precio_cash_ars=D(precio[4]),
                )
                for precio in fila['precios']
            ])


def revertir(apps, schema_editor):
    SeccionService = apps.get_model('precios_service', 'SeccionService')
    ConfiguracionService = apps.get_model('precios_service', 'ConfiguracionService')
    nombres = [s['nombre'] for s in DATA['secciones']]
    # Borrado fisico (cascada elimina variantes, items y precios).
    SeccionService.objects.filter(nombre__in=nombres).delete()
    ConfiguracionService.objects.filter(pk=1).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('precios_service', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
