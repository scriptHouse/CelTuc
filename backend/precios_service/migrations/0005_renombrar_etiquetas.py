# -*- coding: utf-8 -*-
"""Renombra las etiquetas a la grafia linda ("11PRO" -> "iPhone 11 Pro").

Las etiquetas del seed replicaban la grafia cruda de la hoja de Excel. Aca se
normalizan para mostrar: prefijo iPhone, Pro/Max/mini bien escritos, acentos
en las frases ("Baño químico", "Línea 11"). En Módulos, el sufijo
"( AO A PEDIDO )" pasa a la nota de la fila.

GENERADO por script. Idempotente: matchea por (seccion, etiqueta vieja); lo
que ya fue renombrado o editado a mano se saltea sin tocar.
"""
from django.db import migrations


RENOMBRES = [
 [
  "Baterías",
  "6 / 6PLUS / 6S / 6S PLUS",
  "iPhone 6 / 6 Plus / 6S / 6S Plus",
  None
 ],
 [
  "Baterías",
  "7 / 7 PLUS / 8 / 8 PLUS",
  "iPhone 7 / 7 Plus / 8 / 8 Plus",
  None
 ],
 [
  "Baterías",
  "X / XR / XS / XS MAX / SE 2020",
  "iPhone X / XR / XS / XS Max / SE 2020",
  None
 ],
 [
  "Baterías",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Baterías",
  "11PRO",
  "iPhone 11 Pro",
  None
 ],
 [
  "Baterías",
  "11PRO MAX",
  "iPhone 11 Pro Max",
  None
 ],
 [
  "Baterías",
  "12 MINI / 12 / 12 PRO",
  "iPhone 12 mini / 12 / 12 Pro",
  None
 ],
 [
  "Baterías",
  "12PRO MAX",
  "iPhone 12 Pro Max",
  None
 ],
 [
  "Baterías",
  "13 MINI / 13 / SE 2022",
  "iPhone 13 mini / 13 / SE 2022",
  None
 ],
 [
  "Baterías",
  "13 PRO",
  "iPhone 13 Pro",
  None
 ],
 [
  "Baterías",
  "13 PRO MAX",
  "iPhone 13 Pro Max",
  None
 ],
 [
  "Baterías",
  "14 / 14 PLUS",
  "iPhone 14 / 14 Plus",
  None
 ],
 [
  "Baterías",
  "14 PRO",
  "iPhone 14 Pro",
  None
 ],
 [
  "Baterías",
  "14 PRO MAX",
  "iPhone 14 Pro Max",
  None
 ],
 [
  "Baterías",
  "15",
  "iPhone 15",
  None
 ],
 [
  "Baterías",
  "15 PLUS",
  "iPhone 15 Plus",
  None
 ],
 [
  "Baterías",
  "15 PRO",
  "iPhone 15 Pro",
  None
 ],
 [
  "Baterías",
  "15 PRO MAX",
  "iPhone 15 Pro Max",
  None
 ],
 [
  "Baterías",
  "16E",
  "iPhone 16e",
  None
 ],
 [
  "Baterías",
  "16",
  "iPhone 16",
  None
 ],
 [
  "Baterías",
  "16 PLUS",
  "iPhone 16 Plus",
  None
 ],
 [
  "Baterías",
  "16 PRO",
  "iPhone 16 Pro",
  None
 ],
 [
  "Baterías",
  "16 PRO MAX",
  "iPhone 16 Pro Max",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "LINEA 12",
  "Línea 12",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 13 MINI Y 13",
  "iPhone 13 mini y 13",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 13 PRO Y 13 PRO MAX",
  "iPhone 13 Pro y 13 Pro Max",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 14 Y 14 PLUS",
  "iPhone 14 y 14 Plus",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 14 PRO Y 14 PRO MAX",
  "iPhone 14 Pro y 14 Pro Max",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 15 Y 15 PLUS",
  "iPhone 15 y 15 Plus",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 15 PRO Y 15 PRO MAX",
  "iPhone 15 Pro y 15 Pro Max",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 16 Y 16 PLUS",
  "iPhone 16 y 16 Plus",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 16 PRO Y 16 PRO MAX",
  "iPhone 16 Pro y 16 Pro Max",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 17 Y 17 AIR",
  "iPhone 17 y 17 Air",
  None
 ],
 [
  "Cambio de glass de pantalla",
  "IPHONE 17 PRO Y 17 PRO MAX",
  "iPhone 17 Pro y 17 Pro Max",
  None
 ],
 [
  "Módulos",
  "6G / 6PLUS / 6S / 6S PLUS( SOLO BLACK) / SE 2016",
  "iPhone 6 / 6 Plus / 6S / 6S Plus (solo black) / SE 2016",
  None
 ],
 [
  "Módulos",
  "7G / 7 PLUS / 8G / 8 PLUS",
  "iPhone 7 / 7 Plus / 8 / 8 Plus",
  None
 ],
 [
  "Módulos",
  "X / XS",
  "iPhone X / XS",
  None
 ],
 [
  "Módulos",
  "XR",
  "iPhone XR",
  None
 ],
 [
  "Módulos",
  "XS MAX",
  "iPhone XS Max",
  None
 ],
 [
  "Módulos",
  "SE 2020",
  "iPhone SE 2020",
  None
 ],
 [
  "Módulos",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Módulos",
  "11 PRO",
  "iPhone 11 Pro",
  None
 ],
 [
  "Módulos",
  "11 PRO MAX",
  "iPhone 11 Pro Max",
  None
 ],
 [
  "Módulos",
  "12 MINI",
  "iPhone 12 mini",
  None
 ],
 [
  "Módulos",
  "12 / 12 PRO",
  "iPhone 12 / 12 Pro",
  None
 ],
 [
  "Módulos",
  "12 PRO MAX",
  "iPhone 12 Pro Max",
  None
 ],
 [
  "Módulos",
  "13 MINI",
  "iPhone 13 mini",
  None
 ],
 [
  "Módulos",
  "SE 2022",
  "iPhone SE 2022",
  None
 ],
 [
  "Módulos",
  "13",
  "iPhone 13",
  None
 ],
 [
  "Módulos",
  "13 PRO",
  "iPhone 13 Pro",
  None
 ],
 [
  "Módulos",
  "13 PRO MAX",
  "iPhone 13 Pro Max",
  None
 ],
 [
  "Módulos",
  "14",
  "iPhone 14",
  None
 ],
 [
  "Módulos",
  "14 PLUS",
  "iPhone 14 Plus",
  None
 ],
 [
  "Módulos",
  "14 PRO",
  "iPhone 14 Pro",
  None
 ],
 [
  "Módulos",
  "14 PRO MAX",
  "iPhone 14 Pro Max",
  None
 ],
 [
  "Módulos",
  "15 ( AO A PEDIDO )",
  "iPhone 15",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "15 PLUS ( AO A PEDIDO )",
  "iPhone 15 Plus",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "15 PRO ( AO A PEDIDO )",
  "iPhone 15 Pro",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "15 PRO MAX ( AO A PEDIDO )",
  "iPhone 15 Pro Max",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "16E",
  "iPhone 16e",
  None
 ],
 [
  "Módulos",
  "16 ( AO A PEDIDO )",
  "iPhone 16",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "16 PLUS",
  "iPhone 16 Plus",
  None
 ],
 [
  "Módulos",
  "16 PRO ( AO A PEDIDO )",
  "iPhone 16 Pro",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "16 PRO MAX ( AO A PEDIDO )",
  "iPhone 16 Pro Max",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "17 ( AO A PEDIDO )",
  "iPhone 17",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "17 PRO ( AO A PEDIDO )",
  "iPhone 17 Pro",
  "Apple Original a pedido"
 ],
 [
  "Módulos",
  "17 PRO MAX ( AO A PEDIDO )",
  "iPhone 17 Pro Max",
  "Apple Original a pedido"
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "11 PRO",
  "iPhone 11 Pro",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "11 PRO MAX",
  "iPhone 11 Pro Max",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "12 MINI",
  "iPhone 12 mini",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "12 / 12 PRO",
  "iPhone 12 / 12 Pro",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "12 PRO MAX",
  "iPhone 12 Pro Max",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "13 MINI",
  "iPhone 13 mini",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "13",
  "iPhone 13",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "13 PRO",
  "iPhone 13 Pro",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "13 PRO MAX",
  "iPhone 13 Pro Max",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "14",
  "iPhone 14",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "14 PLUS",
  "iPhone 14 Plus",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "14 PRO",
  "iPhone 14 Pro",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "14 PRO MAX",
  "iPhone 14 Pro Max",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "15",
  "iPhone 15",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "15 PLUS",
  "iPhone 15 Plus",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "15 PRO",
  "iPhone 15 Pro",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "15 PRO MAX",
  "iPhone 15 Pro Max",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "16E",
  "iPhone 16e",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "16",
  "iPhone 16",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "16 PLUS",
  "iPhone 16 Plus",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "16 PRO",
  "iPhone 16 Pro",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "16 PRO MAX",
  "iPhone 16 Pro Max",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "17",
  "iPhone 17",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "17 PRO",
  "iPhone 17 Pro",
  None
 ],
 [
  "Quitar mensaje \"pieza desconocida\"",
  "17 PRO MAX",
  "iPhone 17 Pro Max",
  None
 ],
 [
  "Reparaciones generales",
  "DIAGNOSTICO HASTA LINEA 11 (24-72HS)",
  "Diagnóstico hasta línea 11 (24-72 hs)",
  None
 ],
 [
  "Reparaciones generales",
  "DIAGNOSTICO LINEA 12 - LINEA 14 (24-72HS)",
  "Diagnóstico línea 12 - línea 14 (24-72 hs)",
  None
 ],
 [
  "Reparaciones generales",
  "DIAGNOSTICO LINEA 15 - LINEA 16 (24-72HS)",
  "Diagnóstico línea 15 - línea 16 (24-72 hs)",
  None
 ],
 [
  "Reparaciones generales",
  "INTENTO REPARACION DE PLACA TODOS LOS MODELOS",
  "Intento de reparación de placa (todos los modelos)",
  None
 ],
 [
  "Reparaciones generales",
  "SOFTWARE IPHONE (EN EL DIA)",
  "Software iPhone (en el día)",
  None
 ],
 [
  "Reparaciones generales",
  "SOFTWARE IPAD (EN EL DIA)",
  "Software iPad (en el día)",
  None
 ],
 [
  "Reparaciones generales",
  "SOFTWARE MAC OS (5 DIAS HABILES O MAS)",
  "Software macOS (5 días hábiles o más)",
  None
 ],
 [
  "Reparaciones generales",
  "BAÑO QUIMICO HASTA LINEA 11 (24-72HS)",
  "Baño químico hasta línea 11 (24-72 hs)",
  None
 ],
 [
  "Reparaciones generales",
  "BAÑO QUIMICO LINEA 12 - LINEA 14 (24-72HS)",
  "Baño químico línea 12 - línea 14 (24-72 hs)",
  None
 ],
 [
  "Reparaciones generales",
  "BAÑO QUIMICO LINEA 15 - LINEA 16 (24-72HS)",
  "Baño químico línea 15 - línea 16 (24-72 hs)",
  None
 ],
 [
  "Reparaciones generales",
  "BAÑO QUIMICO LINEA 17 (24-72HS)",
  "Baño químico línea 17 (24-72 hs)",
  None
 ],
 [
  "Reparaciones generales",
  "LIMPIEZA FULL (EN EL MOMENTO)",
  "Limpieza full (en el momento)",
  None
 ],
 [
  "Reparaciones generales",
  "LIMPIEZA LOCALIZADA (EN EL MOMENTO)",
  "Limpieza localizada (en el momento)",
  None
 ],
 [
  "Reparaciones generales",
  "TORNILLOS PENTALOBE HASTA LINEA 14",
  "Tornillos pentalobe hasta línea 14",
  None
 ],
 [
  "Reparaciones generales",
  "TORNILLOS PENTALOBE LINEA 15 - LINEA 17",
  "Tornillos pentalobe línea 15 - línea 17",
  None
 ],
 [
  "Reparación de placa",
  "7 / 7+",
  "iPhone 7 / 7 Plus",
  None
 ],
 [
  "Reparación de placa",
  "8 / 8+",
  "iPhone 8 / 8 Plus",
  None
 ],
 [
  "Reparación de placa",
  "SERIE X / SE 2020",
  "iPhone Serie X / SE 2020",
  None
 ],
 [
  "Reparación de placa",
  "11 / SE 2022",
  "iPhone 11 / SE 2022",
  None
 ],
 [
  "Reparación de placa",
  "11 PRO / 11 PRO MAX",
  "iPhone 11 Pro / 11 Pro Max",
  None
 ],
 [
  "Reparación de placa",
  "12 / 12 MINI",
  "iPhone 12 / 12 mini",
  None
 ],
 [
  "Reparación de placa",
  "12 PRO / 12 PRO MAX",
  "iPhone 12 Pro / 12 Pro Max",
  None
 ],
 [
  "Reparación de placa",
  "13 / 13 MINI",
  "iPhone 13 / 13 mini",
  None
 ],
 [
  "Reparación de placa",
  "13 PRO / 13 PRO MAX",
  "iPhone 13 Pro / 13 Pro Max",
  None
 ],
 [
  "Reparación de placa",
  "14 / 14 PLUS",
  "iPhone 14 / 14 Plus",
  None
 ],
 [
  "Reparación de placa",
  "14 PRO / 14 PRO MAX",
  "iPhone 14 Pro / 14 Pro Max",
  None
 ],
 [
  "Reparación de placa",
  "15 / 15 PLUS",
  "iPhone 15 / 15 Plus",
  None
 ],
 [
  "Reparación de placa",
  "15 PRO / 15 PRO MAX",
  "iPhone 15 Pro / 15 Pro Max",
  None
 ],
 [
  "Reparación de placa",
  "16E / 16 / 16 PLUS",
  "iPhone 16e / 16 / 16 Plus",
  None
 ],
 [
  "Reparación de placa",
  "16 PRO / 16 PRO MAX",
  "iPhone 16 Pro / 16 Pro Max",
  None
 ],
 [
  "Reparación de placa",
  "17 / 17 AIR",
  "iPhone 17 / 17 Air",
  None
 ],
 [
  "Reparación de placa",
  "17 PRO / 17 PRO MAX",
  "iPhone 17 Pro / 17 Pro Max",
  None
 ],
 [
  "Reparación de Face ID",
  "LINEA 11",
  "Línea 11",
  None
 ],
 [
  "Reparación de Face ID",
  "LINEA 12",
  "Línea 12",
  None
 ],
 [
  "Reparación de Face ID",
  "LINEA 13",
  "Línea 13",
  None
 ],
 [
  "Reparación de Face ID",
  "LINEA 14",
  "Línea 14",
  None
 ],
 [
  "Reparación de Face ID",
  "LINEA 15",
  "Línea 15",
  None
 ],
 [
  "Reparación de Face ID",
  "LINEA 16",
  "Línea 16",
  None
 ],
 [
  "Cámara trasera",
  "7",
  "iPhone 7",
  None
 ],
 [
  "Cámara trasera",
  "7+",
  "iPhone 7 Plus",
  None
 ],
 [
  "Cámara trasera",
  "8",
  "iPhone 8",
  None
 ],
 [
  "Cámara trasera",
  "8+",
  "iPhone 8 Plus",
  None
 ],
 [
  "Cámara trasera",
  "X",
  "iPhone X",
  None
 ],
 [
  "Cámara trasera",
  "XR",
  "iPhone XR",
  None
 ],
 [
  "Cámara trasera",
  "XS",
  "iPhone XS",
  None
 ],
 [
  "Cámara trasera",
  "XS MAX",
  "iPhone XS Max",
  None
 ],
 [
  "Cámara trasera",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Cámara trasera",
  "11 PRO",
  "iPhone 11 Pro",
  None
 ],
 [
  "Cámara trasera",
  "11 PRO MAX",
  "iPhone 11 Pro Max",
  None
 ],
 [
  "Cámara trasera",
  "12 MINI",
  "iPhone 12 mini",
  None
 ],
 [
  "Cámara trasera",
  "12",
  "iPhone 12",
  None
 ],
 [
  "Cámara trasera",
  "12 PRO",
  "iPhone 12 Pro",
  None
 ],
 [
  "Cámara trasera",
  "12 PRO MAX",
  "iPhone 12 Pro Max",
  None
 ],
 [
  "Cámara trasera",
  "13 MINI",
  "iPhone 13 mini",
  None
 ],
 [
  "Cámara trasera",
  "13",
  "iPhone 13",
  None
 ],
 [
  "Cámara trasera",
  "13 PRO",
  "iPhone 13 Pro",
  None
 ],
 [
  "Cámara trasera",
  "13 PRO MAX",
  "iPhone 13 Pro Max",
  None
 ],
 [
  "Cámara trasera",
  "14",
  "iPhone 14",
  None
 ],
 [
  "Cámara trasera",
  "14 PLUS",
  "iPhone 14 Plus",
  None
 ],
 [
  "Cámara trasera",
  "14 PRO",
  "iPhone 14 Pro",
  None
 ],
 [
  "Cámara trasera",
  "14 PRO MAX",
  "iPhone 14 Pro Max",
  None
 ],
 [
  "Cámara trasera",
  "15",
  "iPhone 15",
  None
 ],
 [
  "Cámara trasera",
  "15 PLUS",
  "iPhone 15 Plus",
  None
 ],
 [
  "Cámara trasera",
  "15 PRO",
  "iPhone 15 Pro",
  None
 ],
 [
  "Cámara trasera",
  "15 PRO MAX",
  "iPhone 15 Pro Max",
  None
 ],
 [
  "Cámara trasera",
  "16E",
  "iPhone 16e",
  None
 ],
 [
  "Cámara trasera",
  "16",
  "iPhone 16",
  None
 ],
 [
  "Cámara trasera",
  "16 PLUS",
  "iPhone 16 Plus",
  None
 ],
 [
  "Cámara trasera",
  "16 PRO",
  "iPhone 16 Pro",
  None
 ],
 [
  "Cámara trasera",
  "16 PRO MAX",
  "iPhone 16 Pro Max",
  None
 ],
 [
  "Cámara trasera",
  "17",
  "iPhone 17",
  None
 ],
 [
  "Cámara trasera",
  "17 AIR",
  "iPhone 17 Air",
  None
 ],
 [
  "Cámara trasera",
  "17 PRO",
  "iPhone 17 Pro",
  None
 ],
 [
  "Cámara trasera",
  "17 PRO MAX",
  "iPhone 17 Pro Max",
  None
 ],
 [
  "Cámara selfie",
  "7",
  "iPhone 7",
  None
 ],
 [
  "Cámara selfie",
  "7+",
  "iPhone 7 Plus",
  None
 ],
 [
  "Cámara selfie",
  "8",
  "iPhone 8",
  None
 ],
 [
  "Cámara selfie",
  "8+",
  "iPhone 8 Plus",
  None
 ],
 [
  "Cámara selfie",
  "X",
  "iPhone X",
  None
 ],
 [
  "Cámara selfie",
  "XR",
  "iPhone XR",
  None
 ],
 [
  "Cámara selfie",
  "XS / SE 2020",
  "iPhone XS / SE 2020",
  None
 ],
 [
  "Cámara selfie",
  "XS MAX",
  "iPhone XS Max",
  None
 ],
 [
  "Cámara selfie",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Cámara selfie",
  "11 PRO",
  "iPhone 11 Pro",
  None
 ],
 [
  "Cámara selfie",
  "11 PRO MAX",
  "iPhone 11 Pro Max",
  None
 ],
 [
  "Cámara selfie",
  "12 MINI",
  "iPhone 12 mini",
  None
 ],
 [
  "Cámara selfie",
  "12",
  "iPhone 12",
  None
 ],
 [
  "Cámara selfie",
  "12 PRO",
  "iPhone 12 Pro",
  None
 ],
 [
  "Cámara selfie",
  "12 PRO MAX",
  "iPhone 12 Pro Max",
  None
 ],
 [
  "Cámara selfie",
  "13 MINI",
  "iPhone 13 mini",
  None
 ],
 [
  "Cámara selfie",
  "13",
  "iPhone 13",
  None
 ],
 [
  "Cámara selfie",
  "13 PRO",
  "iPhone 13 Pro",
  None
 ],
 [
  "Cámara selfie",
  "13 PRO MAX",
  "iPhone 13 Pro Max",
  None
 ],
 [
  "Cámara selfie",
  "14",
  "iPhone 14",
  None
 ],
 [
  "Cámara selfie",
  "14 PLUS",
  "iPhone 14 Plus",
  None
 ],
 [
  "Cámara selfie",
  "14 PRO",
  "iPhone 14 Pro",
  None
 ],
 [
  "Cámara selfie",
  "14 PRO MAX",
  "iPhone 14 Pro Max",
  None
 ],
 [
  "Cámara selfie",
  "15",
  "iPhone 15",
  None
 ],
 [
  "Cámara selfie",
  "15 PLUS",
  "iPhone 15 Plus",
  None
 ],
 [
  "Cámara selfie",
  "15 PRO",
  "iPhone 15 Pro",
  None
 ],
 [
  "Cámara selfie",
  "15 PRO MAX",
  "iPhone 15 Pro Max",
  None
 ],
 [
  "Cámara selfie",
  "16E",
  "iPhone 16e",
  None
 ],
 [
  "Cámara selfie",
  "16",
  "iPhone 16",
  None
 ],
 [
  "Cámara selfie",
  "16 PLUS",
  "iPhone 16 Plus",
  None
 ],
 [
  "Cámara selfie",
  "16 PRO",
  "iPhone 16 Pro",
  None
 ],
 [
  "Cámara selfie",
  "16 PRO MAX",
  "iPhone 16 Pro Max",
  None
 ],
 [
  "Cámara selfie",
  "17",
  "iPhone 17",
  None
 ],
 [
  "Cámara selfie",
  "17 AIR",
  "iPhone 17 Air",
  None
 ],
 [
  "Cámara selfie",
  "17 PRO",
  "iPhone 17 Pro",
  None
 ],
 [
  "Cámara selfie",
  "17 PRO MAX",
  "iPhone 17 Pro Max",
  None
 ],
 [
  "Flex de carga",
  "X",
  "iPhone X",
  None
 ],
 [
  "Flex de carga",
  "XR",
  "iPhone XR",
  None
 ],
 [
  "Flex de carga",
  "XS / SE 2020",
  "iPhone XS / SE 2020",
  None
 ],
 [
  "Flex de carga",
  "XS MAX",
  "iPhone XS Max",
  None
 ],
 [
  "Flex de carga",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Flex de carga",
  "11 PRO",
  "iPhone 11 Pro",
  None
 ],
 [
  "Flex de carga",
  "11 PRO MAX",
  "iPhone 11 Pro Max",
  None
 ],
 [
  "Flex de carga",
  "12 MINI",
  "iPhone 12 mini",
  None
 ],
 [
  "Flex de carga",
  "12",
  "iPhone 12",
  None
 ],
 [
  "Flex de carga",
  "12 PRO",
  "iPhone 12 Pro",
  None
 ],
 [
  "Flex de carga",
  "12 PRO MAX",
  "iPhone 12 Pro Max",
  None
 ],
 [
  "Flex de carga",
  "13 MINI",
  "iPhone 13 mini",
  None
 ],
 [
  "Flex de carga",
  "13",
  "iPhone 13",
  None
 ],
 [
  "Flex de carga",
  "13 PRO",
  "iPhone 13 Pro",
  None
 ],
 [
  "Flex de carga",
  "13 PRO MAX",
  "iPhone 13 Pro Max",
  None
 ],
 [
  "Flex de carga",
  "14",
  "iPhone 14",
  None
 ],
 [
  "Flex de carga",
  "14 PLUS",
  "iPhone 14 Plus",
  None
 ],
 [
  "Flex de carga",
  "14 PRO",
  "iPhone 14 Pro",
  None
 ],
 [
  "Flex de carga",
  "14 PRO MAX",
  "iPhone 14 Pro Max",
  None
 ],
 [
  "Flex de carga",
  "15",
  "iPhone 15",
  None
 ],
 [
  "Flex de carga",
  "15 PLUS",
  "iPhone 15 Plus",
  None
 ],
 [
  "Flex de carga",
  "15 PRO",
  "iPhone 15 Pro",
  None
 ],
 [
  "Flex de carga",
  "15 PRO MAX",
  "iPhone 15 Pro Max",
  None
 ],
 [
  "Flex de carga",
  "16E",
  "iPhone 16e",
  None
 ],
 [
  "Flex de carga",
  "16",
  "iPhone 16",
  None
 ],
 [
  "Flex de carga",
  "16 PRO",
  "iPhone 16 Pro",
  None
 ],
 [
  "Flex de carga",
  "16 PRO MAX",
  "iPhone 16 Pro Max",
  None
 ],
 [
  "Flex de carga",
  "17",
  "iPhone 17",
  None
 ],
 [
  "Flex de carga",
  "17 AIR",
  "iPhone 17 Air",
  None
 ],
 [
  "Flex de carga",
  "17 PRO",
  "iPhone 17 Pro",
  None
 ],
 [
  "Flex de carga",
  "17 PRO MAX",
  "iPhone 17 Pro Max",
  None
 ],
 [
  "Glass de cámara",
  "X",
  "iPhone X",
  None
 ],
 [
  "Glass de cámara",
  "XR",
  "iPhone XR",
  None
 ],
 [
  "Glass de cámara",
  "XS",
  "iPhone XS",
  None
 ],
 [
  "Glass de cámara",
  "XS MAX",
  "iPhone XS Max",
  None
 ],
 [
  "Glass de cámara",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Glass de cámara",
  "11 PRO",
  "iPhone 11 Pro",
  None
 ],
 [
  "Glass de cámara",
  "11 PRO MAX",
  "iPhone 11 Pro Max",
  None
 ],
 [
  "Glass de cámara",
  "12 MINI",
  "iPhone 12 mini",
  None
 ],
 [
  "Glass de cámara",
  "12",
  "iPhone 12",
  None
 ],
 [
  "Glass de cámara",
  "12 PRO",
  "iPhone 12 Pro",
  None
 ],
 [
  "Glass de cámara",
  "12 PRO MAX",
  "iPhone 12 Pro Max",
  None
 ],
 [
  "Glass de cámara",
  "13 MINI",
  "iPhone 13 mini",
  None
 ],
 [
  "Glass de cámara",
  "13",
  "iPhone 13",
  None
 ],
 [
  "Glass de cámara",
  "13 PRO",
  "iPhone 13 Pro",
  None
 ],
 [
  "Glass de cámara",
  "13 PRO MAX",
  "iPhone 13 Pro Max",
  None
 ],
 [
  "Glass de cámara",
  "14",
  "iPhone 14",
  None
 ],
 [
  "Glass de cámara",
  "14 PRO",
  "iPhone 14 Pro",
  None
 ],
 [
  "Glass de cámara",
  "14 PRO MAX",
  "iPhone 14 Pro Max",
  None
 ],
 [
  "Glass de cámara",
  "15",
  "iPhone 15",
  None
 ],
 [
  "Glass de cámara",
  "15 PLUS",
  "iPhone 15 Plus",
  None
 ],
 [
  "Glass de cámara",
  "15 PRO",
  "iPhone 15 Pro",
  None
 ],
 [
  "Glass de cámara",
  "15 PRO MAX",
  "iPhone 15 Pro Max",
  None
 ],
 [
  "Glass de cámara",
  "16E",
  "iPhone 16e",
  None
 ],
 [
  "Glass de cámara",
  "16",
  "iPhone 16",
  None
 ],
 [
  "Glass de cámara",
  "16 PLUS",
  "iPhone 16 Plus",
  None
 ],
 [
  "Glass de cámara",
  "16 PRO",
  "iPhone 16 Pro",
  None
 ],
 [
  "Glass de cámara",
  "16 PRO MAX",
  "iPhone 16 Pro Max",
  None
 ],
 [
  "Glass de cámara",
  "17",
  "iPhone 17",
  None
 ],
 [
  "Glass de cámara",
  "17 AIR",
  "iPhone 17 Air",
  None
 ],
 [
  "Glass de cámara",
  "17 PRO",
  "iPhone 17 Pro",
  None
 ],
 [
  "Glass de cámara",
  "17 PRO MAX",
  "iPhone 17 Pro Max",
  None
 ],
 [
  "Audio oído",
  "LINEA 11",
  "Línea 11",
  None
 ],
 [
  "Audio oído",
  "LINEA 12",
  "Línea 12",
  None
 ],
 [
  "Audio oído",
  "LINEA 13",
  "Línea 13",
  None
 ],
 [
  "Audio oído",
  "LINEA 14",
  "Línea 14",
  None
 ],
 [
  "Audio oído",
  "LINEA 15",
  "Línea 15",
  None
 ],
 [
  "Audio oído",
  "LINEA 16",
  "Línea 16",
  None
 ],
 [
  "Audio oído",
  "LINEA 17",
  "Línea 17",
  None
 ],
 [
  "Tapa trasera",
  "11",
  "iPhone 11",
  None
 ],
 [
  "Tapa trasera",
  "11 PRO / 11 PRO MAX",
  "iPhone 11 Pro / 11 Pro Max",
  None
 ],
 [
  "Tapa trasera",
  "12 MINI / 12",
  "iPhone 12 mini / 12",
  None
 ],
 [
  "Tapa trasera",
  "12 PRO / 12 PRO MAX",
  "iPhone 12 Pro / 12 Pro Max",
  None
 ],
 [
  "Tapa trasera",
  "13 MINI / 13",
  "iPhone 13 mini / 13",
  None
 ],
 [
  "Tapa trasera",
  "13 PRO / 13 PRO MAX",
  "iPhone 13 Pro / 13 Pro Max",
  None
 ],
 [
  "Tapa trasera",
  "14 / 14 PLUS",
  "iPhone 14 / 14 Plus",
  None
 ],
 [
  "Tapa trasera",
  "14 PRO / 14 PRO MAX",
  "iPhone 14 Pro / 14 Pro Max",
  None
 ],
 [
  "Tapa trasera",
  "15 / 15 PLUS",
  "iPhone 15 / 15 Plus",
  None
 ],
 [
  "Tapa trasera",
  "15 PRO / 15 PRO MAX",
  "iPhone 15 Pro / 15 Pro Max",
  None
 ],
 [
  "Tapa trasera",
  "16E / 16 / 16 PLUS",
  "iPhone 16e / 16 / 16 Plus",
  None
 ],
 [
  "Tapa trasera",
  "16 PRO / 16 PRO MAX",
  "iPhone 16 Pro / 16 Pro Max",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 5 / SE 1ra GEN 40MM",
  "Serie 5 / SE 1ra gen 40 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 5 / SE 1RA GEN 44MM",
  "Serie 5 / SE 1ra gen 44 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 6 40MM",
  "Serie 6 40 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 6 44MM",
  "Serie 6 44 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 7 41MM",
  "Serie 7 41 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 7 45MM",
  "Serie 7 45 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 8 41MM",
  "Serie 8 41 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 9 41MM",
  "Serie 9 41 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "SERIE 9 45MM",
  "Serie 9 45 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "ULTRA 1 49MM",
  "Ultra 1 49 mm",
  None
 ],
 [
  "Módulo Apple Watch",
  "ULTRA 2 49MM",
  "Ultra 2 49 mm",
  None
 ]
]


def renombrar(apps, schema_editor):
    ItemService = apps.get_model('precios_service', 'ItemService')
    for seccion, vieja, nueva, nota in RENOMBRES:
        item = ItemService.objects.filter(seccion__nombre=seccion, etiqueta=vieja).first()
        if item is None:
            continue
        item.etiqueta = nueva
        if nota and not item.nota:
            item.nota = nota
        item.save(update_fields=['etiqueta', 'nota'])


def revertir(apps, schema_editor):
    ItemService = apps.get_model('precios_service', 'ItemService')
    for seccion, vieja, nueva, nota in RENOMBRES:
        item = ItemService.objects.filter(seccion__nombre=seccion, etiqueta=nueva).first()
        if item is None:
            continue
        item.etiqueta = vieja
        if nota and item.nota == nota:
            item.nota = ''
        item.save(update_fields=['etiqueta', 'nota'])


class Migration(migrations.Migration):

    dependencies = [
        ('precios_service', '0004_seed_dispositivos_excel'),
    ]

    operations = [
        migrations.RunPython(renombrar, revertir),
    ]
