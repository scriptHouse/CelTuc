# -*- coding: utf-8 -*-
"""Secciones de service de las planillas -> inventario "(no informado)".

GENERADO por script (2026-07-16), pedido del usuario: las filas CON PRECIO de
las secciones de service (BATERIAS, PLACA, MODULOS, ...) de "Stock solar.xlsx"
y "Stock.xlsx Centro.xlsx" tambien existen en el inventario para poder contar
repuestos: producto del catalogo SIN PRECIO (los precios de service siguen en
/service) + fila de stock cantidad=0 sin_dato=True ("no informado") en cada
sucursal, sin movimiento de kardex. Los titulos/notas sin precio se descartan.

Categorias nuevas al final del orden. No pisa nada existente (get_or_create).
"""
from django.db import migrations

DATA = {
 "categorias": [
  "Baterías",
  "Placa",
  "Face ID",
  "Cámara trasera",
  "Cámara selfie",
  "Audio oído",
  "Tapa trasera",
  "Módulo Apple Watch",
  "Flex de carga",
  "Glass de cámara",
  "Módulos"
 ],
 "items": [
  {
   "categoria": "Baterías",
   "nombre": "11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "11PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "11PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "12 MINI / 12 / 12 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "12PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "13 MINI / 13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "13 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "14 / 14 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "14 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "15",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "15 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "15 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "15 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "16 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "16 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "16 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "16E",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "6 / 6PLUS / 6S / 6S PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "7 / 7 PLUS / 8 / 8 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "BAÑO QUIMICO HASTA LINEA 11 (24-72HS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "BAÑO QUIMICO LINEA 12 - LINEA 14 (24-72HS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "BAÑO QUIMICO LINEA 15 - LINEA 16 (24-72HS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "BAÑO QUIMICO LINEA 17 (24-72HS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "DIAGNOSTICO HASTA LINEA 11 (24-72HS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "DIAGNOSTICO LINEA 12 - LINEA 14 (24-72HS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "DIAGNOSTICO LINEA 15 - LINEA 16 (24-72HS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "INTENTO REPARACION DE PLACA TODOS LOS MODELOS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "LIMPIEZA FULL (EN EL MOMENTO)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "LIMPIEZA LOCALIZADA (EN EL MOMENTO)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "SOFTWARE IPAD / MAC OS (5 DIAS HABILES O MAS)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "SOFTWARE IPHONE (EN EL DIA)",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "TORNILLOS PENTALOBE HASTA LINEA 14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "TORNILLOS PENTALOBE LINEA 15 - LINEA 17",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Baterías",
   "nombre": "X / XR / XS / XS MAX / SE 2020",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "11 / SE 2022",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "11 PRO / 11 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "12 / 12 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "12 PRO / 12 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "13 / 13 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "13 PRO / 13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "14 / 14 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "14 PRO / 14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "15 / 15 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "15 PRO / 15 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "16 PRO / 16 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "16E / 16 / 16 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "17 / 17 AIR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "17 PRO / 17 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "7 / 7+",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "8 / 8+",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Placa",
   "nombre": "SERIE X / SE 2020",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Face ID",
   "nombre": "LINEA 11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Face ID",
   "nombre": "LINEA 12",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Face ID",
   "nombre": "LINEA 13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Face ID",
   "nombre": "LINEA 14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Face ID",
   "nombre": "LINEA 15",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Face ID",
   "nombre": "LINEA 16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Face ID",
   "nombre": "LINEA 17",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "11 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "11 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "12",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "12 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "12 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "12 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "13 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "13 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "14 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "14 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "15",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "15 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "15 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "15 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "16 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "16 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "16 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "16E",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "17",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "17 AIR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "17 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "7",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "8",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "X",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "XR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "XS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara trasera",
   "nombre": "XS MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "11 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "11 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "12",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "12 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "12 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "12 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "13 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "13 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "14 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "14 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "15",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "15 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "15 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "15 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "16 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "16 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "16 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "16E",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "17",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "17 AIR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "17 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "17 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "7",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "8",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "X",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "XR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "XS / SE 2020",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Cámara selfie",
   "nombre": "XS MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Audio oído",
   "nombre": "LINEA 11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Audio oído",
   "nombre": "LINEA 12",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Audio oído",
   "nombre": "LINEA 13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Audio oído",
   "nombre": "LINEA 14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Audio oído",
   "nombre": "LINEA 15",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Audio oído",
   "nombre": "LINEA 16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Audio oído",
   "nombre": "LINEA 17",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "11 PRO / 11 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "12 MINI / 12",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "12 PRO / 12 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "13 MINI / 13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "13 PRO / 13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "14 / 14 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "14 PRO / 14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "15 / 15 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "15 PRO / 15 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "16 PRO / 16 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Tapa trasera",
   "nombre": "16E / 16 / 16 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 5 / SE 1RA GEN 44MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 5 / SE 1ra GEN 40MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 6 40MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 6 44MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 7 41MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 7 45MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 8 41MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 9 41MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "SERIE 9 45MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "ULTRA 1 49MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulo Apple Watch",
   "nombre": "ULTRA 2 49MM",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "11 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "11 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "12",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "12 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "12 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "12 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "13 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "13 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "14 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "14 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "15",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "15 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "15 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "15 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "16 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "16 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "16E",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "17",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "17 AIR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "17 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "17 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "X",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "XR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "XS / SE 2020",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Flex de carga",
   "nombre": "XS MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "11 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "11 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "12",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "12 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "12 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "12 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "13 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "13 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "14 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "15",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "15 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "15 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "15 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "16 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "16 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "16 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "16E",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "17",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "17 AIR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "17 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "17 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "X",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "XR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "XS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Glass de cámara",
   "nombre": "XS MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "11",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "11 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "11 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "12 / 12 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "12 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "12 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "13",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "13 MINI",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "13 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "13 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "14",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "14 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "14 PRO",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "14 PRO MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "15 ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "15 PLUS ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "15 PRO ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "15 PRO MAX ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "16 ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "16 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "16 PRO ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "16 PRO MAX ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "16E",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "17 ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "17 PRO ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "17 PRO MAX ( AO A PEDIDO )",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "6G / 6PLUS / 6S / 6S PLUS( SOLO BLACK) / SE 2016",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "7G / 7 PLUS / 8G / 8 PLUS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "SE 2020",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "SE 2022",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "X / XS",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "XR",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Módulos",
   "nombre": "XS MAX",
   "sucursales": [
    "centro",
    "solar"
   ]
  }
 ]
}


def cargar(apps, schema_editor):
    Producto = apps.get_model('productos', 'Producto')
    CategoriaProducto = apps.get_model('productos', 'CategoriaProducto')
    Sucursal = apps.get_model('inventario', 'Sucursal')
    StockProducto = apps.get_model('inventario', 'StockProducto')

    sucursales = {
        'solar': Sucursal.objects.get(nombre='Solar', borrado=False),
        'centro': Sucursal.objects.get(nombre='Centro', borrado=False),
    }

    raices = CategoriaProducto.objects.filter(padre__isnull=True, borrado=False)
    categorias = {c.nombre: c for c in raices}
    siguiente_orden = max((c.orden for c in categorias.values()), default=0) + 1
    for nombre in DATA['categorias']:
        if nombre not in categorias:
            categorias[nombre] = CategoriaProducto.objects.create(
                nombre=nombre, orden=siguiente_orden,
            )
            siguiente_orden += 1

    for item in DATA['items']:
        producto, _ = Producto.objects.get_or_create(
            categoria=categorias[item['categoria']],
            nombre=item['nombre'],
            marca='',
            calidad='',
            nota='',
            borrado=False,
        )
        for etiqueta in item['sucursales']:
            StockProducto.objects.get_or_create(
                producto=producto, sucursal=sucursales[etiqueta], borrado=False,
                defaults={'cantidad': 0, 'sin_dato': True},
            )


def descargar(apps, schema_editor):
    Producto = apps.get_model('productos', 'Producto')
    CategoriaProducto = apps.get_model('productos', 'CategoriaProducto')
    StockProducto = apps.get_model('inventario', 'StockProducto')
    cats = CategoriaProducto.objects.filter(
        nombre__in=DATA['categorias'], padre__isnull=True, borrado=False,
    )
    StockProducto.objects.filter(
        producto__categoria__in=cats, sin_dato=True, cantidad=0,
    ).delete()
    Producto.objects.filter(categoria__in=cats, stocks__isnull=True,
                            items_venta__isnull=True).delete()
    cats.filter(productos__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0006_seed_stock_no_informado'),
    ]

    operations = [
        migrations.RunPython(cargar, descargar),
    ]
