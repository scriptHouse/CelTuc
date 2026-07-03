# -*- coding: utf-8 -*-
"""Catalogo de dispositivos + vinculo de cada fila con los equipos que abarca.

GENERADO por script releyendo la hoja "Precios Service": cada etiqueta se
parseo con las reglas de la planilla (listas con "/", "LINEA 11", rangos
"LINEA 12 - LINEA 14", "HASTA LINEA 11", "SOFTWARE IPHONE" = todos, etc.).
Esto alimenta el selector de equipo/linea de la pagina Service.

Idempotente: los dispositivos se identifican por nombre y el vinculo de cada
item se REEMPLAZA por el del Excel (los items se buscan por seccion+etiqueta;
si un item fue renombrado a mano, simplemente se saltea).
"""
from django.db import migrations


DATA = {
 "dispositivos": [
  [
   "iPhone 6",
   "6"
  ],
  [
   "iPhone 6 Plus",
   "6"
  ],
  [
   "iPhone 6S",
   "6"
  ],
  [
   "iPhone 6S Plus",
   "6"
  ],
  [
   "iPhone SE 2016",
   "SE"
  ],
  [
   "iPhone 7",
   "7"
  ],
  [
   "iPhone 7 Plus",
   "7"
  ],
  [
   "iPhone 8",
   "8"
  ],
  [
   "iPhone 8 Plus",
   "8"
  ],
  [
   "iPhone X",
   "X"
  ],
  [
   "iPhone XR",
   "X"
  ],
  [
   "iPhone XS",
   "X"
  ],
  [
   "iPhone XS Max",
   "X"
  ],
  [
   "iPhone SE 2020",
   "SE"
  ],
  [
   "iPhone 11",
   "11"
  ],
  [
   "iPhone 11 Pro",
   "11"
  ],
  [
   "iPhone 11 Pro Max",
   "11"
  ],
  [
   "iPhone 12 mini",
   "12"
  ],
  [
   "iPhone 12",
   "12"
  ],
  [
   "iPhone 12 Pro",
   "12"
  ],
  [
   "iPhone 12 Pro Max",
   "12"
  ],
  [
   "iPhone 13 mini",
   "13"
  ],
  [
   "iPhone 13",
   "13"
  ],
  [
   "iPhone 13 Pro",
   "13"
  ],
  [
   "iPhone 13 Pro Max",
   "13"
  ],
  [
   "iPhone SE 2022",
   "SE"
  ],
  [
   "iPhone 14",
   "14"
  ],
  [
   "iPhone 14 Plus",
   "14"
  ],
  [
   "iPhone 14 Pro",
   "14"
  ],
  [
   "iPhone 14 Pro Max",
   "14"
  ],
  [
   "iPhone 15",
   "15"
  ],
  [
   "iPhone 15 Plus",
   "15"
  ],
  [
   "iPhone 15 Pro",
   "15"
  ],
  [
   "iPhone 15 Pro Max",
   "15"
  ],
  [
   "iPhone 16e",
   "16"
  ],
  [
   "iPhone 16",
   "16"
  ],
  [
   "iPhone 16 Plus",
   "16"
  ],
  [
   "iPhone 16 Pro",
   "16"
  ],
  [
   "iPhone 16 Pro Max",
   "16"
  ],
  [
   "iPhone 17",
   "17"
  ],
  [
   "iPhone 17 Air",
   "17"
  ],
  [
   "iPhone 17 Pro",
   "17"
  ],
  [
   "iPhone 17 Pro Max",
   "17"
  ],
  [
   "iPad",
   "iPad"
  ],
  [
   "Mac",
   "Mac"
  ],
  [
   "Apple Watch",
   "Watch"
  ]
 ],
 "items": [
  [
   "Baterías",
   "6 / 6PLUS / 6S / 6S PLUS",
   [
    0,
    1,
    2,
    3
   ]
  ],
  [
   "Baterías",
   "7 / 7 PLUS / 8 / 8 PLUS",
   [
    5,
    6,
    7,
    8
   ]
  ],
  [
   "Baterías",
   "X / XR / XS / XS MAX / SE 2020",
   [
    9,
    10,
    11,
    12,
    13
   ]
  ],
  [
   "Baterías",
   "11",
   [
    14
   ]
  ],
  [
   "Baterías",
   "11PRO",
   [
    15
   ]
  ],
  [
   "Baterías",
   "11PRO MAX",
   [
    16
   ]
  ],
  [
   "Baterías",
   "12 MINI / 12 / 12 PRO",
   [
    17,
    18,
    19
   ]
  ],
  [
   "Baterías",
   "12PRO MAX",
   [
    20
   ]
  ],
  [
   "Baterías",
   "13 MINI / 13 / SE 2022",
   [
    21,
    22,
    25
   ]
  ],
  [
   "Baterías",
   "13 PRO",
   [
    23
   ]
  ],
  [
   "Baterías",
   "13 PRO MAX",
   [
    24
   ]
  ],
  [
   "Baterías",
   "14 / 14 PLUS",
   [
    26,
    27
   ]
  ],
  [
   "Baterías",
   "14 PRO",
   [
    28
   ]
  ],
  [
   "Baterías",
   "14 PRO MAX",
   [
    29
   ]
  ],
  [
   "Baterías",
   "15",
   [
    30
   ]
  ],
  [
   "Baterías",
   "15 PLUS",
   [
    31
   ]
  ],
  [
   "Baterías",
   "15 PRO",
   [
    32
   ]
  ],
  [
   "Baterías",
   "15 PRO MAX",
   [
    33
   ]
  ],
  [
   "Baterías",
   "16E",
   [
    34
   ]
  ],
  [
   "Baterías",
   "16",
   [
    35
   ]
  ],
  [
   "Baterías",
   "16 PLUS",
   [
    36
   ]
  ],
  [
   "Baterías",
   "16 PRO",
   [
    37
   ]
  ],
  [
   "Baterías",
   "16 PRO MAX",
   [
    38
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "LINEA 12",
   [
    17,
    18,
    19,
    20
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 13 MINI Y 13",
   [
    21,
    22
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 13 PRO Y 13 PRO MAX",
   [
    23,
    24
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 14 Y 14 PLUS",
   [
    26,
    27
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 14 PRO Y 14 PRO MAX",
   [
    28,
    29
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 15 Y 15 PLUS",
   [
    30,
    31
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 15 PRO Y 15 PRO MAX",
   [
    32,
    33
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 16 Y 16 PLUS",
   [
    35,
    36
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 16 PRO Y 16 PRO MAX",
   [
    37,
    38
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 17 Y 17 AIR",
   [
    39,
    40
   ]
  ],
  [
   "Cambio de glass de pantalla",
   "IPHONE 17 PRO Y 17 PRO MAX",
   [
    41,
    42
   ]
  ],
  [
   "Módulos",
   "6G / 6PLUS / 6S / 6S PLUS( SOLO BLACK) / SE 2016",
   [
    0,
    1,
    2,
    3,
    4
   ]
  ],
  [
   "Módulos",
   "7G / 7 PLUS / 8G / 8 PLUS",
   [
    5,
    6,
    7,
    8
   ]
  ],
  [
   "Módulos",
   "X / XS",
   [
    9,
    11
   ]
  ],
  [
   "Módulos",
   "XR",
   [
    10
   ]
  ],
  [
   "Módulos",
   "XS MAX",
   [
    12
   ]
  ],
  [
   "Módulos",
   "SE 2020",
   [
    13
   ]
  ],
  [
   "Módulos",
   "11",
   [
    14
   ]
  ],
  [
   "Módulos",
   "11 PRO",
   [
    15
   ]
  ],
  [
   "Módulos",
   "11 PRO MAX",
   [
    16
   ]
  ],
  [
   "Módulos",
   "12 MINI",
   [
    17
   ]
  ],
  [
   "Módulos",
   "12 / 12 PRO",
   [
    18,
    19
   ]
  ],
  [
   "Módulos",
   "12 PRO MAX",
   [
    20
   ]
  ],
  [
   "Módulos",
   "13 MINI",
   [
    21
   ]
  ],
  [
   "Módulos",
   "SE 2022",
   [
    25
   ]
  ],
  [
   "Módulos",
   "13",
   [
    22
   ]
  ],
  [
   "Módulos",
   "13 PRO",
   [
    23
   ]
  ],
  [
   "Módulos",
   "13 PRO MAX",
   [
    24
   ]
  ],
  [
   "Módulos",
   "14",
   [
    26
   ]
  ],
  [
   "Módulos",
   "14 PLUS",
   [
    27
   ]
  ],
  [
   "Módulos",
   "14 PRO",
   [
    28
   ]
  ],
  [
   "Módulos",
   "14 PRO MAX",
   [
    29
   ]
  ],
  [
   "Módulos",
   "15 ( AO A PEDIDO )",
   [
    30
   ]
  ],
  [
   "Módulos",
   "15 PLUS ( AO A PEDIDO )",
   [
    31
   ]
  ],
  [
   "Módulos",
   "15 PRO ( AO A PEDIDO )",
   [
    32
   ]
  ],
  [
   "Módulos",
   "15 PRO MAX ( AO A PEDIDO )",
   [
    33
   ]
  ],
  [
   "Módulos",
   "16E",
   [
    34
   ]
  ],
  [
   "Módulos",
   "16 ( AO A PEDIDO )",
   [
    35
   ]
  ],
  [
   "Módulos",
   "16 PLUS",
   [
    36
   ]
  ],
  [
   "Módulos",
   "16 PRO ( AO A PEDIDO )",
   [
    37
   ]
  ],
  [
   "Módulos",
   "16 PRO MAX ( AO A PEDIDO )",
   [
    38
   ]
  ],
  [
   "Módulos",
   "17 ( AO A PEDIDO )",
   [
    39
   ]
  ],
  [
   "Módulos",
   "17 PRO ( AO A PEDIDO )",
   [
    41
   ]
  ],
  [
   "Módulos",
   "17 PRO MAX ( AO A PEDIDO )",
   [
    42
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "11",
   [
    14
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "11 PRO",
   [
    15
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "11 PRO MAX",
   [
    16
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "12 MINI",
   [
    17
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "12 / 12 PRO",
   [
    18,
    19
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "12 PRO MAX",
   [
    20
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "13 MINI",
   [
    21
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "13",
   [
    22
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "13 PRO",
   [
    23
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "13 PRO MAX",
   [
    24
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "14",
   [
    26
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "14 PLUS",
   [
    27
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "14 PRO",
   [
    28
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "14 PRO MAX",
   [
    29
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "15",
   [
    30
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "15 PLUS",
   [
    31
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "15 PRO",
   [
    32
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "15 PRO MAX",
   [
    33
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "16E",
   [
    34
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "16",
   [
    35
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "16 PLUS",
   [
    36
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "16 PRO",
   [
    37
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "16 PRO MAX",
   [
    38
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "17",
   [
    39
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "17 PRO",
   [
    41
   ]
  ],
  [
   "Quitar mensaje \"pieza desconocida\"",
   "17 PRO MAX",
   [
    42
   ]
  ],
  [
   "Reparaciones generales",
   "DIAGNOSTICO HASTA LINEA 11 (24-72HS)",
   [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16
   ]
  ],
  [
   "Reparaciones generales",
   "DIAGNOSTICO LINEA 12 - LINEA 14 (24-72HS)",
   [
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29
   ]
  ],
  [
   "Reparaciones generales",
   "DIAGNOSTICO LINEA 15 - LINEA 16 (24-72HS)",
   [
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38
   ]
  ],
  [
   "Reparaciones generales",
   "INTENTO REPARACION DE PLACA TODOS LOS MODELOS",
   [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38,
    39,
    40,
    41,
    42
   ]
  ],
  [
   "Reparaciones generales",
   "SOFTWARE IPHONE (EN EL DIA)",
   [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38,
    39,
    40,
    41,
    42
   ]
  ],
  [
   "Reparaciones generales",
   "SOFTWARE IPAD (EN EL DIA)",
   [
    43
   ]
  ],
  [
   "Reparaciones generales",
   "SOFTWARE MAC OS (5 DIAS HABILES O MAS)",
   [
    44
   ]
  ],
  [
   "Reparaciones generales",
   "BAÑO QUIMICO HASTA LINEA 11 (24-72HS)",
   [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16
   ]
  ],
  [
   "Reparaciones generales",
   "BAÑO QUIMICO LINEA 12 - LINEA 14 (24-72HS)",
   [
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29
   ]
  ],
  [
   "Reparaciones generales",
   "BAÑO QUIMICO LINEA 15 - LINEA 16 (24-72HS)",
   [
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38
   ]
  ],
  [
   "Reparaciones generales",
   "BAÑO QUIMICO LINEA 17 (24-72HS)",
   [
    39,
    40,
    41,
    42
   ]
  ],
  [
   "Reparaciones generales",
   "LIMPIEZA FULL (EN EL MOMENTO)",
   [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38,
    39,
    40,
    41,
    42
   ]
  ],
  [
   "Reparaciones generales",
   "LIMPIEZA LOCALIZADA (EN EL MOMENTO)",
   [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38,
    39,
    40,
    41,
    42
   ]
  ],
  [
   "Reparaciones generales",
   "TORNILLOS PENTALOBE HASTA LINEA 14",
   [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29
   ]
  ],
  [
   "Reparaciones generales",
   "TORNILLOS PENTALOBE LINEA 15 - LINEA 17",
   [
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38,
    39,
    40,
    41,
    42
   ]
  ],
  [
   "Reparación de placa",
   "7 / 7+",
   [
    5,
    6
   ]
  ],
  [
   "Reparación de placa",
   "8 / 8+",
   [
    7,
    8
   ]
  ],
  [
   "Reparación de placa",
   "SERIE X / SE 2020",
   [
    9,
    10,
    11,
    12,
    13
   ]
  ],
  [
   "Reparación de placa",
   "11 / SE 2022",
   [
    14,
    25
   ]
  ],
  [
   "Reparación de placa",
   "11 PRO / 11 PRO MAX",
   [
    15,
    16
   ]
  ],
  [
   "Reparación de placa",
   "12 / 12 MINI",
   [
    17,
    18
   ]
  ],
  [
   "Reparación de placa",
   "12 PRO / 12 PRO MAX",
   [
    19,
    20
   ]
  ],
  [
   "Reparación de placa",
   "13 / 13 MINI",
   [
    21,
    22
   ]
  ],
  [
   "Reparación de placa",
   "13 PRO / 13 PRO MAX",
   [
    23,
    24
   ]
  ],
  [
   "Reparación de placa",
   "14 / 14 PLUS",
   [
    26,
    27
   ]
  ],
  [
   "Reparación de placa",
   "14 PRO / 14 PRO MAX",
   [
    28,
    29
   ]
  ],
  [
   "Reparación de placa",
   "15 / 15 PLUS",
   [
    30,
    31
   ]
  ],
  [
   "Reparación de placa",
   "15 PRO / 15 PRO MAX",
   [
    32,
    33
   ]
  ],
  [
   "Reparación de placa",
   "16E / 16 / 16 PLUS",
   [
    34,
    35,
    36
   ]
  ],
  [
   "Reparación de placa",
   "16 PRO / 16 PRO MAX",
   [
    37,
    38
   ]
  ],
  [
   "Reparación de placa",
   "17 / 17 AIR",
   [
    39,
    40
   ]
  ],
  [
   "Reparación de placa",
   "17 PRO / 17 PRO MAX",
   [
    41,
    42
   ]
  ],
  [
   "Reparación de Face ID",
   "LINEA 11",
   [
    14,
    15,
    16
   ]
  ],
  [
   "Reparación de Face ID",
   "LINEA 12",
   [
    17,
    18,
    19,
    20
   ]
  ],
  [
   "Reparación de Face ID",
   "LINEA 13",
   [
    21,
    22,
    23,
    24,
    25
   ]
  ],
  [
   "Reparación de Face ID",
   "LINEA 14",
   [
    26,
    27,
    28,
    29
   ]
  ],
  [
   "Reparación de Face ID",
   "LINEA 15",
   [
    30,
    31,
    32,
    33
   ]
  ],
  [
   "Reparación de Face ID",
   "LINEA 16",
   [
    34,
    35,
    36,
    37,
    38
   ]
  ],
  [
   "Cámara trasera",
   "7",
   [
    5
   ]
  ],
  [
   "Cámara trasera",
   "7+",
   [
    6
   ]
  ],
  [
   "Cámara trasera",
   "8",
   [
    7
   ]
  ],
  [
   "Cámara trasera",
   "8+",
   [
    8
   ]
  ],
  [
   "Cámara trasera",
   "X",
   [
    9
   ]
  ],
  [
   "Cámara trasera",
   "XR",
   [
    10
   ]
  ],
  [
   "Cámara trasera",
   "XS",
   [
    11
   ]
  ],
  [
   "Cámara trasera",
   "XS MAX",
   [
    12
   ]
  ],
  [
   "Cámara trasera",
   "11",
   [
    14
   ]
  ],
  [
   "Cámara trasera",
   "11 PRO",
   [
    15
   ]
  ],
  [
   "Cámara trasera",
   "11 PRO MAX",
   [
    16
   ]
  ],
  [
   "Cámara trasera",
   "12 MINI",
   [
    17
   ]
  ],
  [
   "Cámara trasera",
   "12",
   [
    18
   ]
  ],
  [
   "Cámara trasera",
   "12 PRO",
   [
    19
   ]
  ],
  [
   "Cámara trasera",
   "12 PRO MAX",
   [
    20
   ]
  ],
  [
   "Cámara trasera",
   "13 MINI",
   [
    21
   ]
  ],
  [
   "Cámara trasera",
   "13",
   [
    22
   ]
  ],
  [
   "Cámara trasera",
   "13 PRO",
   [
    23
   ]
  ],
  [
   "Cámara trasera",
   "13 PRO MAX",
   [
    24
   ]
  ],
  [
   "Cámara trasera",
   "14",
   [
    26
   ]
  ],
  [
   "Cámara trasera",
   "14 PLUS",
   [
    27
   ]
  ],
  [
   "Cámara trasera",
   "14 PRO",
   [
    28
   ]
  ],
  [
   "Cámara trasera",
   "14 PRO MAX",
   [
    29
   ]
  ],
  [
   "Cámara trasera",
   "15",
   [
    30
   ]
  ],
  [
   "Cámara trasera",
   "15 PLUS",
   [
    31
   ]
  ],
  [
   "Cámara trasera",
   "15 PRO",
   [
    32
   ]
  ],
  [
   "Cámara trasera",
   "15 PRO MAX",
   [
    33
   ]
  ],
  [
   "Cámara trasera",
   "16E",
   [
    34
   ]
  ],
  [
   "Cámara trasera",
   "16",
   [
    35
   ]
  ],
  [
   "Cámara trasera",
   "16 PLUS",
   [
    36
   ]
  ],
  [
   "Cámara trasera",
   "16 PRO",
   [
    37
   ]
  ],
  [
   "Cámara trasera",
   "16 PRO MAX",
   [
    38
   ]
  ],
  [
   "Cámara trasera",
   "17",
   [
    39
   ]
  ],
  [
   "Cámara trasera",
   "17 AIR",
   [
    40
   ]
  ],
  [
   "Cámara trasera",
   "17 PRO",
   [
    41
   ]
  ],
  [
   "Cámara trasera",
   "17 PRO MAX",
   [
    42
   ]
  ],
  [
   "Cámara selfie",
   "7",
   [
    5
   ]
  ],
  [
   "Cámara selfie",
   "7+",
   [
    6
   ]
  ],
  [
   "Cámara selfie",
   "8",
   [
    7
   ]
  ],
  [
   "Cámara selfie",
   "8+",
   [
    8
   ]
  ],
  [
   "Cámara selfie",
   "X",
   [
    9
   ]
  ],
  [
   "Cámara selfie",
   "XR",
   [
    10
   ]
  ],
  [
   "Cámara selfie",
   "XS / SE 2020",
   [
    11,
    13
   ]
  ],
  [
   "Cámara selfie",
   "XS MAX",
   [
    12
   ]
  ],
  [
   "Cámara selfie",
   "11",
   [
    14
   ]
  ],
  [
   "Cámara selfie",
   "11 PRO",
   [
    15
   ]
  ],
  [
   "Cámara selfie",
   "11 PRO MAX",
   [
    16
   ]
  ],
  [
   "Cámara selfie",
   "12 MINI",
   [
    17
   ]
  ],
  [
   "Cámara selfie",
   "12",
   [
    18
   ]
  ],
  [
   "Cámara selfie",
   "12 PRO",
   [
    19
   ]
  ],
  [
   "Cámara selfie",
   "12 PRO MAX",
   [
    20
   ]
  ],
  [
   "Cámara selfie",
   "13 MINI",
   [
    21
   ]
  ],
  [
   "Cámara selfie",
   "13",
   [
    22
   ]
  ],
  [
   "Cámara selfie",
   "13 PRO",
   [
    23
   ]
  ],
  [
   "Cámara selfie",
   "13 PRO MAX",
   [
    24
   ]
  ],
  [
   "Cámara selfie",
   "14",
   [
    26
   ]
  ],
  [
   "Cámara selfie",
   "14 PLUS",
   [
    27
   ]
  ],
  [
   "Cámara selfie",
   "14 PRO",
   [
    28
   ]
  ],
  [
   "Cámara selfie",
   "14 PRO MAX",
   [
    29
   ]
  ],
  [
   "Cámara selfie",
   "15",
   [
    30
   ]
  ],
  [
   "Cámara selfie",
   "15 PLUS",
   [
    31
   ]
  ],
  [
   "Cámara selfie",
   "15 PRO",
   [
    32
   ]
  ],
  [
   "Cámara selfie",
   "15 PRO MAX",
   [
    33
   ]
  ],
  [
   "Cámara selfie",
   "16E",
   [
    34
   ]
  ],
  [
   "Cámara selfie",
   "16",
   [
    35
   ]
  ],
  [
   "Cámara selfie",
   "16 PLUS",
   [
    36
   ]
  ],
  [
   "Cámara selfie",
   "16 PRO",
   [
    37
   ]
  ],
  [
   "Cámara selfie",
   "16 PRO MAX",
   [
    38
   ]
  ],
  [
   "Cámara selfie",
   "17",
   [
    39
   ]
  ],
  [
   "Cámara selfie",
   "17 AIR",
   [
    40
   ]
  ],
  [
   "Cámara selfie",
   "17 PRO",
   [
    41
   ]
  ],
  [
   "Cámara selfie",
   "17 PRO MAX",
   [
    42
   ]
  ],
  [
   "Flex de carga",
   "X",
   [
    9
   ]
  ],
  [
   "Flex de carga",
   "XR",
   [
    10
   ]
  ],
  [
   "Flex de carga",
   "XS / SE 2020",
   [
    11,
    13
   ]
  ],
  [
   "Flex de carga",
   "XS MAX",
   [
    12
   ]
  ],
  [
   "Flex de carga",
   "11",
   [
    14
   ]
  ],
  [
   "Flex de carga",
   "11 PRO",
   [
    15
   ]
  ],
  [
   "Flex de carga",
   "11 PRO MAX",
   [
    16
   ]
  ],
  [
   "Flex de carga",
   "12 MINI",
   [
    17
   ]
  ],
  [
   "Flex de carga",
   "12",
   [
    18
   ]
  ],
  [
   "Flex de carga",
   "12 PRO",
   [
    19
   ]
  ],
  [
   "Flex de carga",
   "12 PRO MAX",
   [
    20
   ]
  ],
  [
   "Flex de carga",
   "13 MINI",
   [
    21
   ]
  ],
  [
   "Flex de carga",
   "13",
   [
    22
   ]
  ],
  [
   "Flex de carga",
   "13 PRO",
   [
    23
   ]
  ],
  [
   "Flex de carga",
   "13 PRO MAX",
   [
    24
   ]
  ],
  [
   "Flex de carga",
   "14",
   [
    26
   ]
  ],
  [
   "Flex de carga",
   "14 PLUS",
   [
    27
   ]
  ],
  [
   "Flex de carga",
   "14 PRO",
   [
    28
   ]
  ],
  [
   "Flex de carga",
   "14 PRO MAX",
   [
    29
   ]
  ],
  [
   "Flex de carga",
   "15",
   [
    30
   ]
  ],
  [
   "Flex de carga",
   "15 PLUS",
   [
    31
   ]
  ],
  [
   "Flex de carga",
   "15 PRO",
   [
    32
   ]
  ],
  [
   "Flex de carga",
   "15 PRO MAX",
   [
    33
   ]
  ],
  [
   "Flex de carga",
   "16E",
   [
    34
   ]
  ],
  [
   "Flex de carga",
   "16",
   [
    35
   ]
  ],
  [
   "Flex de carga",
   "16 PRO",
   [
    37
   ]
  ],
  [
   "Flex de carga",
   "16 PRO MAX",
   [
    38
   ]
  ],
  [
   "Flex de carga",
   "17",
   [
    39
   ]
  ],
  [
   "Flex de carga",
   "17 AIR",
   [
    40
   ]
  ],
  [
   "Flex de carga",
   "17 PRO",
   [
    41
   ]
  ],
  [
   "Flex de carga",
   "17 PRO MAX",
   [
    42
   ]
  ],
  [
   "Glass de cámara",
   "X",
   [
    9
   ]
  ],
  [
   "Glass de cámara",
   "XR",
   [
    10
   ]
  ],
  [
   "Glass de cámara",
   "XS",
   [
    11
   ]
  ],
  [
   "Glass de cámara",
   "XS MAX",
   [
    12
   ]
  ],
  [
   "Glass de cámara",
   "11",
   [
    14
   ]
  ],
  [
   "Glass de cámara",
   "11 PRO",
   [
    15
   ]
  ],
  [
   "Glass de cámara",
   "11 PRO MAX",
   [
    16
   ]
  ],
  [
   "Glass de cámara",
   "12 MINI",
   [
    17
   ]
  ],
  [
   "Glass de cámara",
   "12",
   [
    18
   ]
  ],
  [
   "Glass de cámara",
   "12 PRO",
   [
    19
   ]
  ],
  [
   "Glass de cámara",
   "12 PRO MAX",
   [
    20
   ]
  ],
  [
   "Glass de cámara",
   "13 MINI",
   [
    21
   ]
  ],
  [
   "Glass de cámara",
   "13",
   [
    22
   ]
  ],
  [
   "Glass de cámara",
   "13 PRO",
   [
    23
   ]
  ],
  [
   "Glass de cámara",
   "13 PRO MAX",
   [
    24
   ]
  ],
  [
   "Glass de cámara",
   "14",
   [
    26
   ]
  ],
  [
   "Glass de cámara",
   "14 PRO",
   [
    28
   ]
  ],
  [
   "Glass de cámara",
   "14 PRO MAX",
   [
    29
   ]
  ],
  [
   "Glass de cámara",
   "15",
   [
    30
   ]
  ],
  [
   "Glass de cámara",
   "15 PLUS",
   [
    31
   ]
  ],
  [
   "Glass de cámara",
   "15 PRO",
   [
    32
   ]
  ],
  [
   "Glass de cámara",
   "15 PRO MAX",
   [
    33
   ]
  ],
  [
   "Glass de cámara",
   "16E",
   [
    34
   ]
  ],
  [
   "Glass de cámara",
   "16",
   [
    35
   ]
  ],
  [
   "Glass de cámara",
   "16 PLUS",
   [
    36
   ]
  ],
  [
   "Glass de cámara",
   "16 PRO",
   [
    37
   ]
  ],
  [
   "Glass de cámara",
   "16 PRO MAX",
   [
    38
   ]
  ],
  [
   "Glass de cámara",
   "17",
   [
    39
   ]
  ],
  [
   "Glass de cámara",
   "17 AIR",
   [
    40
   ]
  ],
  [
   "Glass de cámara",
   "17 PRO",
   [
    41
   ]
  ],
  [
   "Glass de cámara",
   "17 PRO MAX",
   [
    42
   ]
  ],
  [
   "Audio oído",
   "LINEA 11",
   [
    14,
    15,
    16
   ]
  ],
  [
   "Audio oído",
   "LINEA 12",
   [
    17,
    18,
    19,
    20
   ]
  ],
  [
   "Audio oído",
   "LINEA 13",
   [
    21,
    22,
    23,
    24,
    25
   ]
  ],
  [
   "Audio oído",
   "LINEA 14",
   [
    26,
    27,
    28,
    29
   ]
  ],
  [
   "Audio oído",
   "LINEA 15",
   [
    30,
    31,
    32,
    33
   ]
  ],
  [
   "Audio oído",
   "LINEA 16",
   [
    34,
    35,
    36,
    37,
    38
   ]
  ],
  [
   "Audio oído",
   "LINEA 17",
   [
    39,
    40,
    41,
    42
   ]
  ],
  [
   "Tapa trasera",
   "11",
   [
    14
   ]
  ],
  [
   "Tapa trasera",
   "11 PRO / 11 PRO MAX",
   [
    15,
    16
   ]
  ],
  [
   "Tapa trasera",
   "12 MINI / 12",
   [
    17,
    18
   ]
  ],
  [
   "Tapa trasera",
   "12 PRO / 12 PRO MAX",
   [
    19,
    20
   ]
  ],
  [
   "Tapa trasera",
   "13 MINI / 13",
   [
    21,
    22
   ]
  ],
  [
   "Tapa trasera",
   "13 PRO / 13 PRO MAX",
   [
    23,
    24
   ]
  ],
  [
   "Tapa trasera",
   "14 / 14 PLUS",
   [
    26,
    27
   ]
  ],
  [
   "Tapa trasera",
   "14 PRO / 14 PRO MAX",
   [
    28,
    29
   ]
  ],
  [
   "Tapa trasera",
   "15 / 15 PLUS",
   [
    30,
    31
   ]
  ],
  [
   "Tapa trasera",
   "15 PRO / 15 PRO MAX",
   [
    32,
    33
   ]
  ],
  [
   "Tapa trasera",
   "16E / 16 / 16 PLUS",
   [
    34,
    35,
    36
   ]
  ],
  [
   "Tapa trasera",
   "16 PRO / 16 PRO MAX",
   [
    37,
    38
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 5 / SE 1ra GEN 40MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 5 / SE 1RA GEN 44MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 6 40MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 6 44MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 7 41MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 7 45MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 8 41MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 9 41MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "SERIE 9 45MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "ULTRA 1 49MM",
   [
    45
   ]
  ],
  [
   "Módulo Apple Watch",
   "ULTRA 2 49MM",
   [
    45
   ]
  ]
 ]
}


def sembrar(apps, schema_editor):
    Dispositivo = apps.get_model('precios_service', 'Dispositivo')
    ItemService = apps.get_model('precios_service', 'ItemService')

    dispositivos = []
    for orden, (nombre, linea) in enumerate(DATA['dispositivos']):
        dispositivo, _ = Dispositivo.objects.update_or_create(
            nombre=nombre,
            defaults={'linea': linea, 'orden': orden, 'activo': True, 'borrado': False},
        )
        dispositivos.append(dispositivo)

    for seccion_nombre, etiqueta, indices in DATA['items']:
        item = ItemService.objects.filter(
            seccion__nombre=seccion_nombre, etiqueta=etiqueta,
        ).first()
        if item is None:
            continue  # renombrado/eliminado a mano: no forzamos nada
        item.dispositivos.set([dispositivos[i].id for i in indices])


def revertir(apps, schema_editor):
    Dispositivo = apps.get_model('precios_service', 'Dispositivo')
    nombres = [nombre for nombre, _ in DATA['dispositivos']]
    # Borrado fisico (limpia tambien las filas del vinculo M2M).
    Dispositivo.objects.filter(nombre__in=nombres).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('precios_service', '0003_dispositivo_itemservice_dispositivos_and_more'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
