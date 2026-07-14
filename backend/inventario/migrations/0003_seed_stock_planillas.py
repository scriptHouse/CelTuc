# -*- coding: utf-8 -*-
"""Carga inicial de stock desde las planillas de las sucursales (jul 2026).

GENERADO por script leyendo "Stock solar.xlsx" y "Stock.xlsx Centro.xlsx"
celda por celda. Matchea contra el catalogo por (categoria, nombre, marca,
calidad, nota, lista USD); los productos de las planillas que no estaban en el
catalogo se crean aca (solo los que tienen stock cargado). Ademas deja un
movimiento de "carga inicial" por cada cantidad > 0 (el kardex arranca aca).

NO modifica precios existentes ni el dolar del negocio.
"""
from decimal import Decimal

from django.db import migrations

DATA = {
 "crear": [
  {
   "categoria": "Auriculares",
   "nombre": "JBL Tune 525 BT",
   "marca": "JBL",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "91.8",
   "stock": {
    "solar": 1,
    "centro": 3
   }
  },
  {
   "categoria": "Productos Apple",
   "nombre": "AirTag Pack X4",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "125",
   "stock": {
    "solar": 3,
    "centro": 1
   }
  },
  {
   "categoria": "Productos Apple",
   "nombre": "AirTag X1",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "45",
   "stock": {
    "solar": 3,
    "centro": 1
   }
  },
  {
   "categoria": "Productos Apple",
   "nombre": "Macbook Air M5 13'' 24/512GB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "1750",
   "stock": {
    "solar": 1,
    "centro": 1
   }
  },
  {
   "categoria": "Smartwatch",
   "nombre": "S9 Ultra",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "56.1",
   "stock": {
    "centro": 1
   }
  },
  {
   "categoria": "Smartwatch",
   "nombre": "T500",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "40.8",
   "stock": {
    "centro": 2
   }
  },
  {
   "categoria": "Varios",
   "nombre": "Funda Folio iPad 11va Gen (A16) y iPad 13''",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "40.8",
   "stock": {
    "solar": 6,
    "centro": 11
   }
  },
  {
   "categoria": "Varios",
   "nombre": "alexa echo show 10",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": None,
   "stock": {
    "solar": 1
   }
  },
  {
   "categoria": "Varios",
   "nombre": "auriculares ftx ftxe56l",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": None,
   "stock": {
    "solar": 4
   }
  },
  {
   "categoria": "Varios",
   "nombre": "jbl wind 35",
   "marca": "JBL",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": None,
   "stock": {
    "solar": 2
   }
  },
  {
   "categoria": "Varios",
   "nombre": "magnetic watch charging",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": None,
   "stock": {
    "solar": 5
   }
  },
  {
   "categoria": "Varios",
   "nombre": "parlante quanta",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": None,
   "stock": {
    "solar": 1
   }
  }
 ],
 "stock": [
  {
   "clave": [
    "Auriculares",
    None,
    "Auricular IPhone Lightning",
    "",
    "Calidad original",
    "",
    "26.52"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Auricular iPhone Lightning",
    "",
    "Apple original",
    "",
    "43.86"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 2
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Auricular iPhone USB-C",
    "",
    "Calidad original",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Auricular iPhone USB-C",
    "",
    "Apple original",
    "",
    "49.98"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Haylou S30",
    "Haylou",
    "",
    "",
    "66.30"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Endurance Race 2",
    "JBL",
    "",
    "",
    "153.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Endurance Run 3",
    "JBL",
    "",
    "",
    "91.80"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Quantum 250",
    "JBL",
    "",
    "",
    "132.60"
   ],
   "idx": 0,
   "solar": 4,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Quantum 350",
    "JBL",
    "",
    "",
    "204.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Tune 310C Entrada USB-C",
    "JBL",
    "",
    "",
    "33.66"
   ],
   "idx": 0,
   "solar": 5,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Tune 500 (entrada auxiliar)",
    "JBL",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 8
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Tune 520C (entrada USB-C)",
    "JBL",
    "",
    "",
    "63.24"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 3
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Tune 720 BT",
    "JBL",
    "",
    "",
    "107.10"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Tune 770 NC",
    "JBL",
    "",
    "",
    "132.60"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 2
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL WaveBeam 2",
    "JBL",
    "",
    "",
    "115.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Redmi Buds 6 Play",
    "Redmi",
    "",
    "",
    "25.50"
   ],
   "idx": 0,
   "solar": 6,
   "centro": 3
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Redmi Buds 8 Lite ( Con cancelacion de sonido )",
    "Redmi",
    "",
    "",
    "45.90"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 6
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Replica Airpods Max P9",
    "",
    "",
    "",
    "30.00"
   ],
   "idx": 0,
   "solar": 5,
   "centro": 5
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Replica Airpods Pro 2",
    "",
    "",
    "",
    "60.00"
   ],
   "idx": 0,
   "solar": 17,
   "centro": 5
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Replica Airpods Pro 3",
    "",
    "",
    "",
    "70.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Xiaomi Earphones USB-C",
    "Xiaomi",
    "",
    "",
    "17.34"
   ],
   "idx": 0,
   "solar": 9,
   "centro": 2
  },
  {
   "clave": [
    "Cables",
    None,
    "Adaptador Lightning-Aux ( Desarmado )",
    "",
    "Calidad original",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 3
  },
  {
   "clave": [
    "Cables",
    None,
    "Adaptador USB-C - Aux",
    "",
    "Calidad original",
    "",
    "10.20"
   ],
   "idx": 0,
   "solar": 16,
   "centro": 10
  },
  {
   "clave": [
    "Cables",
    None,
    "Adaptador USB-C a Aux",
    "",
    "Apple original",
    "",
    "44.88"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 5
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable Lightning a USB 1M",
    "",
    "Apple original",
    "",
    "35.00"
   ],
   "idx": 0,
   "solar": 24,
   "centro": 11
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable Lightning a USB 1M",
    "",
    "Calidad original",
    "",
    "10.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 9
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable USB-C A Lightning 1M",
    "",
    "Calidad original",
    "",
    "12.00"
   ],
   "idx": 0,
   "solar": 51,
   "centro": 5
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable USB-C a Lightning 1M",
    "",
    "Apple original",
    "",
    "38.00"
   ],
   "idx": 0,
   "solar": 6,
   "centro": None
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable USB-C a MagSafe 3 Macbook",
    "",
    "Calidad original",
    "",
    "61.20"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable USB-C a USB-C 1M MALLADO",
    "",
    "Calidad original",
    "",
    "14.00"
   ],
   "idx": 0,
   "solar": 65,
   "centro": 36
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable USB-C a USB-C 240w 2M (Apto MacBook)",
    "",
    "Apple original",
    "",
    "58.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable USB-C a USB-C 60w 1M",
    "",
    "Apple original",
    "",
    "40.00"
   ],
   "idx": 0,
   "solar": 20,
   "centro": None
  },
  {
   "clave": [
    "Cables",
    None,
    "Cargador Apple Watch USB-C",
    "Apple",
    "Calidad original",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 4,
   "centro": 5
  },
  {
   "clave": [
    "Cables",
    None,
    "Cargador Apple Watch USB-C",
    "Apple",
    "Apple original",
    "",
    "66.30"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 1
  },
  {
   "clave": [
    "Cables",
    None,
    "Cargador Magsafe",
    "",
    "Calidad original",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": 9,
   "centro": None
  },
  {
   "clave": [
    "Cables",
    None,
    "Cargador Magsafe",
    "",
    "Apple original",
    "",
    "57.12"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Cables",
    "USB a Lightning",
    "Cable USB a Lightning 3M Mallado Baseus",
    "Baseus",
    "Original",
    "",
    "22.44"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 6
  },
  {
   "clave": [
    "Cables",
    "USB-C a Lightning",
    "Cable Power Link USB-C a Lightning 1M CLD",
    "CLD",
    "",
    "",
    "10.20"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Cables",
    "USB-C a Lightning",
    "Cable Silicone Color USB-C a Lightning 1M CLD",
    "CLD",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Cables",
    "USB-C a Lightning",
    "Cable USB-C a Lightning 1M Baseus",
    "Baseus",
    "Original",
    "",
    "22.44"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Cables",
    "USB-C a Lightning",
    "Cable USB-C a Lightning 1M Ezra ( Tanto el de 27w como el otro )",
    "Ezra",
    "",
    "",
    "10.20"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB",
    "Cable USB-C a USB 1M Xiaomi",
    "Xiaomi",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB",
    "Cable USB-C a USB 1M iGlufive (Caja Plastica cuadrada)",
    "iGlufive",
    "",
    "",
    "12.24"
   ],
   "idx": 0,
   "solar": 9,
   "centro": 6
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C 1M Belkin",
    "Belkin",
    "Original",
    "",
    "25.50"
   ],
   "idx": 0,
   "solar": None,
   "centro": 6
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C 1M Samsung",
    "Samsung",
    "Original",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": 9,
   "centro": 3
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C 1M TRV",
    "TRV",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 6,
   "centro": 17
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C 240w 2M Ringke",
    "Ringke",
    "Original",
    "",
    "34.68"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 4
  },
  {
   "clave": [
    "Consolas",
    None,
    "Nintendo Switch 2 256GB",
    "Nintendo",
    "",
    "",
    "956.25"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Consolas",
    None,
    "Xbox Series S 512GB",
    "Xbox",
    "",
    "",
    "748.75"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Battery Pack 10.000 mAh",
    "",
    "Calidad original",
    "",
    "45.90"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Battery Pack 5.000 mAh",
    "",
    "Calidad original",
    "",
    "30.60"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 3
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente 20W",
    "",
    "Calidad original",
    "",
    "25.00"
   ],
   "idx": 0,
   "solar": 56,
   "centro": 32
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente 20W",
    "",
    "Apple original",
    "",
    "60.00"
   ],
   "idx": 0,
   "solar": 21,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente 40-60 W",
    "",
    "Calidad original",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 4,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente Motorola 68W Duo USB-C",
    "Motorola",
    "Original",
    "",
    "38.76"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente Samsung 25W",
    "Samsung",
    "Original",
    "",
    "38.76"
   ],
   "idx": 0,
   "solar": 9,
   "centro": 1
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente Samsung 25W SIN CABLE",
    "Samsung",
    "Calidad original",
    "",
    "20.00"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 4
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente Xiaomi Mi 20W USB-C",
    "Xiaomi",
    "Original",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": 7,
   "centro": 5
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "MacBook MagSafe 3 USB-C 30W",
    "",
    "Calidad original",
    "",
    "71.40"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "MacBook MagSafe 3 USB-C 45W",
    "",
    "Calidad original",
    "",
    "76.50"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "MacBook MagSafe 3 USB-C 61W",
    "",
    "Calidad original",
    "",
    "86.70"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "MacBook USB-C 96W",
    "",
    "Calidad original",
    "",
    "132.60"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Spigen 30W + CABLE USB-C a USB-C",
    "Spigen",
    "Original",
    "",
    "55.08"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Xiaomi PowerBank 10000 mAh ( cable integrado )",
    "Xiaomi",
    "",
    "",
    "38.76"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Xiaomi PowerBank 20000 mAh ( cable integrado )",
    "Xiaomi",
    "",
    "",
    "56.10"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Fundas",
    None,
    "Acrylic Case ( Para todos los modelos )",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": 47,
   "centro": 37
  },
  {
   "clave": [
    "Fundas",
    None,
    "Antishock TODA LA LINEA",
    "",
    "",
    "",
    "7.14"
   ],
   "idx": 0,
   "solar": 283,
   "centro": 57
  },
  {
   "clave": [
    "Fundas",
    None,
    "Bag Case",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": None,
   "centro": 7
  },
  {
   "clave": [
    "Fundas",
    None,
    "Bubble Case",
    "",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 42,
   "centro": 49
  },
  {
   "clave": [
    "Fundas",
    None,
    "Bumper Case",
    "",
    "",
    "",
    "7.14"
   ],
   "idx": 0,
   "solar": 30,
   "centro": 110
  },
  {
   "clave": [
    "Fundas",
    None,
    "Candy Case",
    "",
    "",
    "x2 $5.000 · x3 $6.000",
    None
   ],
   "idx": 0,
   "solar": 58,
   "centro": 51
  },
  {
   "clave": [
    "Fundas",
    None,
    "Clear Case",
    "",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 18,
   "centro": 4
  },
  {
   "clave": [
    "Fundas",
    None,
    "Clear Case + Proteccion de camara",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": 7,
   "centro": None
  },
  {
   "clave": [
    "Fundas",
    None,
    "Clear Case 3 en 1",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": 9,
   "centro": None
  },
  {
   "clave": [
    "Fundas",
    None,
    "Clear Magnetic LINEA 17",
    "",
    "",
    "",
    "22.44"
   ],
   "idx": 0,
   "solar": None,
   "centro": 18
  },
  {
   "clave": [
    "Fundas",
    None,
    "Degrade Case",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": 24,
   "centro": 5
  },
  {
   "clave": [
    "Fundas",
    None,
    "Jelly Case",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": 42,
   "centro": 30
  },
  {
   "clave": [
    "Fundas",
    None,
    "MagSafe Dual Case",
    "",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Fundas",
    None,
    "MagSafe Premium Case",
    "",
    "",
    "",
    "22.44"
   ],
   "idx": 0,
   "solar": 22,
   "centro": None
  },
  {
   "clave": [
    "Fundas",
    None,
    "Magnetic Case ( Transparente y de color ) TODA LA LINEA",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": 26,
   "centro": 91
  },
  {
   "clave": [
    "Fundas",
    None,
    "Metalic Case",
    "",
    "",
    "",
    "18.36"
   ],
   "idx": 0,
   "solar": 30,
   "centro": 14
  },
  {
   "clave": [
    "Fundas",
    None,
    "Minimal Case",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": 21,
   "centro": 26
  },
  {
   "clave": [
    "Fundas",
    None,
    "Pocket Case",
    "",
    "",
    "",
    "25.50"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Fundas",
    None,
    "Premium Case",
    "",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 47,
   "centro": 19
  },
  {
   "clave": [
    "Fundas",
    None,
    "Puffer Case ( Los 3 modelos )",
    "",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 108,
   "centro": 51
  },
  {
   "clave": [
    "Fundas",
    None,
    "Ringke Fusion",
    "Ringke",
    "",
    "",
    "35.70"
   ],
   "idx": 0,
   "solar": None,
   "centro": 15
  },
  {
   "clave": [
    "Fundas",
    None,
    "Ringke Onyx",
    "Ringke",
    "",
    "",
    "23.46"
   ],
   "idx": 0,
   "solar": None,
   "centro": 3
  },
  {
   "clave": [
    "Fundas",
    None,
    "Ringke Silicone Magnetic",
    "Ringke",
    "",
    "",
    "45.90"
   ],
   "idx": 0,
   "solar": None,
   "centro": 4
  },
  {
   "clave": [
    "Fundas",
    None,
    "Silicone Case 6 - 16 PM",
    "",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 456,
   "centro": 769
  },
  {
   "clave": [
    "Fundas",
    None,
    "Silicone Case LINEA 17",
    "",
    "",
    "",
    "16.32"
   ],
   "idx": 0,
   "solar": 95,
   "centro": 87
  },
  {
   "clave": [
    "Fundas",
    None,
    "Silky Case",
    "",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Fundas",
    None,
    "Spigen Liquid Air",
    "Spigen",
    "",
    "",
    "51.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 7
  },
  {
   "clave": [
    "Fundas",
    None,
    "Spigen Rugged Armor Para Airtag",
    "Spigen",
    "",
    "",
    "56.10"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Fundas",
    None,
    "Stylish Case",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": None,
   "centro": 3
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Brand Case",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": None,
   "centro": 6
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Case Circular",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": None,
   "centro": 24
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Correa Case",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": 5,
   "centro": None
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Evogem",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": 13,
   "centro": 35
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Funda 360",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": 12,
   "centro": 27
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Glitter Case ( Los 3 modelos )",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": 4,
   "centro": 23
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Grip Case",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": None,
   "centro": 6
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Hexagonal",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": None,
   "centro": 4
  },
  {
   "clave": [
    "Fundas en liquidación",
    None,
    "Reforzada ( Neon y Transparente )",
    "",
    "",
    "x2 $6.000",
    None
   ],
   "idx": 0,
   "solar": None,
   "centro": 22
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Dot (sin reloj)",
    "Alexa",
    "",
    "",
    "102.96"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Pop",
    "Alexa",
    "",
    "",
    "84.79"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Show 11",
    "Alexa",
    "",
    "",
    "484.50"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Show 21",
    "Alexa",
    "",
    "",
    "787.31"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Show 5",
    "Alexa",
    "",
    "",
    "157.46"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Show 8",
    "Alexa",
    "",
    "",
    "251.94"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Spot",
    "Alexa",
    "",
    "",
    "121.12"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Parlantes",
    None,
    "BoomBox 4",
    "JBL",
    "",
    "",
    "787.31"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Charge 6",
    "JBL",
    "",
    "",
    "230.14"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 2
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Flip 6",
    "JBL",
    "",
    "",
    "140.51"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Flip 7",
    "JBL",
    "",
    "",
    "164.73"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 3
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Go 4",
    "JBL",
    "",
    "",
    "66.62"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Go 5",
    "JBL",
    "",
    "",
    "84.79"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Go Essential",
    "JBL",
    "",
    "",
    "54.51"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 3
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Go Essential 2",
    "JBL",
    "",
    "",
    "60.56"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "JBL PartyBox On The Go Essential",
    "JBL",
    "",
    "",
    "569.29"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Xiaomi Mi Portable",
    "Xiaomi",
    "",
    "",
    "31.98"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Xiaomi Smart Speaker Lite (asistente tipo Alexa)",
    "Xiaomi",
    "",
    "",
    "72.68"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Xtreme 3",
    "JBL",
    "",
    "",
    "363.38"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Xtreme 4",
    "JBL",
    "",
    "",
    "416.67"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Airpods 4ta Gen",
    "Apple",
    "",
    "",
    "170.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Airpods 4ta Gen ANC",
    "Apple",
    "",
    "",
    "240.00"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Airpods Pro 3ra gen USB-C",
    "Apple",
    "",
    "",
    "340.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 3
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series 10 46mm",
    "Apple",
    "",
    "",
    "440.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series 11 42mm",
    "Apple",
    "",
    "",
    "470.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series 11 46mm",
    "Apple",
    "",
    "",
    "499.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series SE 2 44mm",
    "Apple",
    "",
    "",
    "350.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series SE 3 40mm",
    "Apple",
    "",
    "",
    "380.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series SE 3 44mm",
    "Apple",
    "",
    "",
    "410.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 3
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "MacBook Neo 13'' 8/256GB ( no trae Touch ID )",
    "Apple",
    "",
    "",
    "860.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "MacBook Neo 13'' 8/512GB (SI trae Touch ID )",
    "Apple",
    "",
    "",
    "960.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Macbook Air M4 13'' 16/256GB",
    "Apple",
    "",
    "",
    "1199.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 3
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Macbook Air M5 13'' 16/512GB",
    "Apple",
    "",
    "",
    "1299.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Macbook Pro 14'' M5 16/1TB",
    "Apple",
    "",
    "",
    "1999.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Magic Mouse 2",
    "Apple",
    "",
    "",
    "120.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Pencil 1",
    "Apple",
    "",
    "",
    "150.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Pencil 2da Gen",
    "Apple",
    "",
    "",
    "140.00"
   ],
   "idx": 0,
   "solar": 4,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Pencil Pro",
    "Apple",
    "",
    "",
    "190.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Pencil USB-C",
    "Apple",
    "",
    "",
    "140.00"
   ],
   "idx": 0,
   "solar": 4,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad 11va Gen (A16) 128GB",
    "Apple",
    "",
    "",
    "480.00"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad Air M3 11'' 128GB",
    "Apple",
    "",
    "",
    "699.00"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad Air M4 11'' 128GB",
    "Apple",
    "",
    "",
    "770.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad Air M4 11'' 256GB",
    "Apple",
    "",
    "",
    "870.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad Pro M5 11'' 256GB",
    "Apple",
    "",
    "",
    "1140.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad Pro M5 13'' 256GB",
    "Apple",
    "",
    "",
    "1499.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Samsung",
    None,
    "S25 FE 8GB/256GB",
    "Samsung",
    "",
    "",
    "699.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Samsung",
    None,
    "S25 Ultra 12GB/256GB",
    "Samsung",
    "",
    "",
    "1099.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Samsung",
    None,
    "S25 Ultra 12GB/512GB",
    "Samsung",
    "",
    "",
    "1199.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 1
  },
  {
   "clave": [
    "Samsung",
    None,
    "S26 Ultra 12GB/256GB",
    "Samsung",
    "",
    "",
    "1250.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Samsung",
    None,
    "S26 Ultra 12GB/512GB",
    "Samsung",
    "",
    "",
    "1350.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Amafit Bip 6",
    "Amafit",
    "",
    "",
    "122.40"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Haylou Neo Solar",
    "Haylou",
    "",
    "",
    "50.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Haylou RS3",
    "Haylou",
    "",
    "",
    "45.90"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Haylou RS5",
    "Haylou",
    "",
    "",
    "56.10"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Haylou Watch 2 Pro",
    "Haylou",
    "",
    "",
    "51.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Kieslect K10",
    "Kieslect",
    "",
    "",
    "35.70"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Replica Apple Watch Ultra 2",
    "Apple",
    "",
    "",
    "86.70"
   ],
   "idx": 0,
   "solar": 4,
   "centro": 4
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Xiaomi Redmi Watch 5",
    "Xiaomi",
    "",
    "",
    "132.60"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Xiaomi Redmi Watch 5 Active",
    "Xiaomi",
    "",
    "",
    "56.10"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Xiaomi Redmi Watch 5 Lite",
    "Xiaomi",
    "",
    "",
    "76.50"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 1
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "Xiaomi Smart Band 10",
    "Xiaomi",
    "",
    "",
    "76.50"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 4
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Hidrogel Antiespia",
    "",
    "",
    "",
    "17.34"
   ],
   "idx": 0,
   "solar": 12,
   "centro": 2
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Hidrogel Comun",
    "",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 8,
   "centro": 2
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Hidrogel Comun Premium (Reparacion automatica)",
    "",
    "",
    "",
    "15.30"
   ],
   "idx": 0,
   "solar": 17,
   "centro": 2
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Hidrogel Matte",
    "",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Protector Case negro o transparente 360 Apple Watch ( desde 38mm a 49mm )",
    "Apple",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 37,
   "centro": None
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado 9D",
    "",
    "",
    "",
    "6.12"
   ],
   "idx": 0,
   "solar": None,
   "centro": 174
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Antiespía",
    "",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "solar": 168,
   "centro": 90
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Camara Brillo",
    "",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "solar": 60,
   "centro": 49
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Camara Completo LINEA 17",
    "",
    "",
    "",
    "15.30"
   ],
   "idx": 0,
   "solar": 39,
   "centro": 42
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Camara Metal/Anillo Protector",
    "",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "solar": 123,
   "centro": 420
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Camara Transparente",
    "",
    "",
    "",
    "7.14"
   ],
   "idx": 0,
   "solar": None,
   "centro": 115
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Común",
    "",
    "",
    "",
    "3.06"
   ],
   "idx": 0,
   "solar": 768,
   "centro": 329
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Ringke Easy Slide 17Pro y 17 ProMax ( pack X2 )",
    "Ringke",
    "",
    "",
    "35.70"
   ],
   "idx": 0,
   "solar": 8,
   "centro": 1
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Super Glass 9D",
    "",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 141,
   "centro": 23
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado iPad ( TODOS LOS MODELOS )",
    "",
    "",
    "",
    "25.50"
   ],
   "idx": 0,
   "solar": None,
   "centro": 16
  },
  {
   "clave": [
    "Varios",
    None,
    "3 en 1 Magnetic Wireless Charger",
    "",
    "",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "3 en 1 Wireless Charger (Foldable)",
    "",
    "",
    "",
    "51.00"
   ],
   "idx": 0,
   "solar": 5,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Adaptador USB-C MacBook",
    "",
    "",
    "",
    "33.66"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Varios",
    None,
    "Adaptador ficha americana",
    "",
    "",
    "",
    "2.04"
   ],
   "idx": 0,
   "solar": 35,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Adaptadores USB-C a Light, USB-C a USB, y demas",
    "",
    "",
    "",
    "12.24"
   ],
   "idx": 0,
   "solar": 4,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Anillo Ringo",
    "",
    "",
    "",
    "4.39"
   ],
   "idx": 0,
   "solar": 5,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Cargador auto Magsafe 15W",
    "",
    "",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Comecable",
    "",
    "",
    "",
    "3.06"
   ],
   "idx": 0,
   "solar": 13,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Compresor de aire Xiaomi 2 Pro",
    "Xiaomi",
    "",
    "",
    "234.60"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Convertidor Smart Tv Amazon fire stick 4K",
    "Amazon",
    "",
    "",
    "89.76"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Convertidor Smart Tv Amazon fire stick Lite",
    "Amazon",
    "",
    "",
    "66.30"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Convertidor Xiaomi Mi Tv Stick",
    "Xiaomi",
    "",
    "",
    "76.50"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Crossbody Strap",
    "",
    "",
    "",
    "30.60"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Estacion de carga Joystick PS5 Dualsense",
    "",
    "",
    "",
    "71.40"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Estuche JBL Charge",
    "JBL",
    "",
    "",
    "35.70"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Estuche JBL Flip",
    "JBL",
    "",
    "",
    "30.60"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Estuche o Funda Nintendo Switch 2 Super Mario",
    "Nintendo",
    "",
    "",
    "80.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Fun shot magnetic grip2",
    "",
    "",
    "",
    "76.50"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Funda Airpods 4 Ringke (Clear y Glitter Clear)",
    "Ringke",
    "",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Funda Airpods Case Protective (Case cuerina y brillo) (para todos los modelos)",
    "",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 12,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Funda Airpods Case Silicone o Transparente (para todos los modelos)",
    "",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 11,
   "centro": 36
  },
  {
   "clave": [
    "Varios",
    None,
    "Funda Airpods Diseno (para todos los modelos)",
    "",
    "",
    "",
    "13.26"
   ],
   "idx": 0,
   "solar": 12,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Funda Airtag Silicona",
    "",
    "",
    "",
    "7.14"
   ],
   "idx": 0,
   "solar": 10,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Google TV Streamer 4K",
    "Google",
    "",
    "",
    "204.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Hub USB-C 3 Puertos TP Link",
    "TP Link",
    "",
    "",
    "55.00"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 9
  },
  {
   "clave": [
    "Varios",
    None,
    "Hub USB-C HDTV 6 en 1",
    "",
    "",
    "",
    "60.00"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 4
  },
  {
   "clave": [
    "Varios",
    None,
    "Hub Xioami 5 en 1",
    "",
    "",
    "",
    "70.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Joy-Con Nintendo Switch 2",
    "Nintendo",
    "",
    "",
    "204.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Joystick Dualsense Edge PS5",
    "",
    "",
    "",
    "357.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 2
  },
  {
   "clave": [
    "Varios",
    None,
    "Joystick Dualsense PS5",
    "",
    "",
    "",
    "132.60"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 4
  },
  {
   "clave": [
    "Varios",
    None,
    "Joystick Xbox",
    "Xbox",
    "",
    "",
    "132.60"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 2
  },
  {
   "clave": [
    "Varios",
    None,
    "Kindle Paperwhite 11va Gen 16GB Pantalla 6\"",
    "Kindle",
    "",
    "",
    "224.40"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Kindle Paperwhite 12va Gen 16GB Pantalla 7\"",
    "Kindle",
    "",
    "",
    "265.20"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Kit de Limpieza 8 en 1",
    "",
    "",
    "",
    "16.32"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Malla Magnetica Silicona Apple Watch (ambos modelos)",
    "Apple",
    "",
    "Mallas 38/40/41/42 mm compatibles entre sí; 42/44/45/46/49 mm entre sí",
    "40.80"
   ],
   "idx": 0,
   "solar": 0,
   "centro": 10
  },
  {
   "clave": [
    "Varios",
    None,
    "Malla Metalica (ambos modelos)",
    "",
    "",
    "Mallas 38/40/41/42 mm compatibles entre sí; 42/44/45/46/49 mm entre sí",
    "40.80"
   ],
   "idx": 0,
   "solar": 9,
   "centro": 11
  },
  {
   "clave": [
    "Varios",
    None,
    "Malla Nylon o Tela (cualquier modelo)",
    "",
    "",
    "Mallas 38/40/41/42 mm compatibles entre sí; 42/44/45/46/49 mm entre sí",
    "25.50"
   ],
   "idx": 0,
   "solar": 34,
   "centro": 13
  },
  {
   "clave": [
    "Varios",
    None,
    "Malla Silicona Apple Watch (lisa, con agujeros y ondulada ultra)",
    "Apple",
    "",
    "Mallas 38/40/41/42 mm compatibles entre sí; 42/44/45/46/49 mm entre sí",
    "20.40"
   ],
   "idx": 0,
   "solar": 36,
   "centro": 61
  },
  {
   "clave": [
    "Varios",
    None,
    "Medidor Laser Xiaomi",
    "Xiaomi",
    "",
    "",
    "69.36"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Mouse Inalambrico Logitech M185",
    "Logitech",
    "",
    "",
    "16.32"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Mouse Inalambrico Redragon BM-4054",
    "Redragon",
    "",
    "",
    "16.32"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Mouse USB Redragon BM-4049 USB",
    "Redragon",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Varios",
    None,
    "Mouse USB Redragon BM-4062 USB",
    "Redragon",
    "",
    "",
    "10.20"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "P-Grab",
    "",
    "",
    "",
    "4.39"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 8
  },
  {
   "clave": [
    "Varios",
    None,
    "Pantalla magnética selfie",
    "",
    "",
    "",
    "71.40"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "PartyBox Wireless Mic",
    "",
    "",
    "",
    "224.40"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Partylight Beam",
    "",
    "",
    "",
    "224.40"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Pencil Yookie ( compatible con todos los iPads )",
    "",
    "",
    "",
    "44.88"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Pendrive Kingstone 128GB USB 3.2",
    "Kingstone",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Pendrive Patriot 32GB USB-C + USB 3.2",
    "Patriot",
    "",
    "",
    "20.40"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Pendrive Patriot 64GB USB-C + USB 3.2",
    "Patriot",
    "",
    "",
    "30.60"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Pendrive Sandisk 32GB USB 3.2",
    "Sandisk",
    "",
    "",
    "20.40"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Pop Socket Corazon",
    "",
    "",
    "",
    "4.39"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Pop Socket Oso",
    "",
    "",
    "",
    "4.39"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 8
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte Auto Ringke",
    "Ringke",
    "",
    "",
    "33.66"
   ],
   "idx": 0,
   "solar": 4,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte Holder (apto para vehiculo)",
    "",
    "",
    "",
    "27.54"
   ],
   "idx": 0,
   "solar": 3,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte Magenitco Macbook/Notebook",
    "",
    "",
    "",
    "16.32"
   ],
   "idx": 0,
   "solar": 9,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte Phone Stand",
    "",
    "",
    "",
    "22.44"
   ],
   "idx": 0,
   "solar": 3,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte Selfie Stick 360 P01 ( Seguimiento facil, ideal inlfiuencers )",
    "",
    "",
    "",
    "76.50"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte Selfie Stick 360 Q02 ( Seguimiento facil, ideal inlfiuencers )",
    "",
    "",
    "",
    "66.30"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte magnetico a succion Lambo Tech LT-415",
    "",
    "",
    "",
    "19.38"
   ],
   "idx": 0,
   "solar": 4,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte magnetico a succion Vacuum CCT28",
    "",
    "",
    "",
    "15.30"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Soporte metalico celular (Collapsible telescopic bracket)",
    "",
    "",
    "",
    "10.20"
   ],
   "idx": 0,
   "solar": 4,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Sticky Pad Circular o Rectangular",
    "",
    "",
    "",
    "3.37"
   ],
   "idx": 0,
   "solar": 15,
   "centro": 61
  },
  {
   "clave": [
    "Varios",
    None,
    "Strap Holder",
    "",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "solar": 18,
   "centro": 2
  },
  {
   "clave": [
    "Varios",
    None,
    "Teclado BT inalambrico",
    "",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Tira Grab",
    "",
    "",
    "",
    "4.39"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    None,
    "Wallet",
    "",
    "",
    "",
    "15.30"
   ],
   "idx": 0,
   "solar": 7,
   "centro": 4
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Electric Scooter 4 Pro",
    "Xiaomi",
    "",
    "",
    "1173.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Mi 20W Wireless Charging Stand",
    "Xiaomi",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Mi Door and Window Sensor 2",
    "Xiaomi",
    "",
    "",
    "35.70"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Mi Motion 2",
    "Xiaomi",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Smart Camera C200",
    "Xiaomi",
    "",
    "",
    "61.20"
   ],
   "idx": 0,
   "solar": 1,
   "centro": None
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Smart Camera C301",
    "Xiaomi",
    "",
    "",
    "71.40"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Antishock iPad 11va Gen (A16)",
    "",
    "",
    "",
    "20.00"
   ],
   "idx": 0,
   "solar": 10,
   "centro": 18
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Carcaza MacBook Air 13''( compatible M2 hasta M5 )",
    "",
    "",
    "",
    "40.00"
   ],
   "idx": 0,
   "solar": 6,
   "centro": 4
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Carcaza MacBook Air 15''( compatible M2 hasta M5 )",
    "",
    "",
    "",
    "50.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 2
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Funda Cuero iPad 11va Gen (A16)",
    "",
    "",
    "",
    "33.00"
   ],
   "idx": 0,
   "solar": 8,
   "centro": 6
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Funda con cierre JOOG iPad 10.9/11''",
    "JOOG",
    "",
    "",
    "45.00"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Funda con cierre MacBook O NoteBook 12-14''",
    "",
    "",
    "",
    "40.00"
   ],
   "idx": 0,
   "solar": 7,
   "centro": 10
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Magnetic Keyboard JOOG iPad 12.9/13''",
    "JOOG",
    "",
    "",
    "255.00"
   ],
   "idx": 0,
   "solar": 2,
   "centro": None
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Note 14 4G 6GB/128GB",
    "Xiaomi",
    "",
    "",
    "267.75"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Note 14C 4GB/128GB",
    "Xiaomi",
    "",
    "",
    "191.25"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Note 14S 4G 8GB/256GB",
    "Xiaomi",
    "",
    "",
    "331.50"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 2
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Note 15 Pro 4G 8GB/256GB",
    "Xiaomi",
    "",
    "",
    "446.25"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "POCO C71 4GB/128GB",
    "POCO",
    "",
    "",
    "146.63"
   ],
   "idx": 0,
   "solar": 2,
   "centro": 1
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "POCO C75 6GB/128GB",
    "POCO",
    "",
    "",
    "191.25"
   ],
   "idx": 0,
   "solar": 1,
   "centro": 1
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "POCO M6 8GB/256GB",
    "POCO",
    "",
    "",
    "280.50"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Redmi 15C 8GB/256GB",
    "Redmi",
    "",
    "",
    "255.00"
   ],
   "idx": 0,
   "solar": None,
   "centro": 2
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Redmi A5 4GB/128GB",
    "Redmi",
    "",
    "",
    "178.50"
   ],
   "idx": 0,
   "solar": None,
   "centro": 1
  }
 ]
}


def _clave(categoria, producto):
    padre = categoria.padre if categoria.padre_id else None
    raiz = padre.nombre if padre else categoria.nombre
    sub = categoria.nombre if padre else None
    lu = str(producto.precio_lista_usd) if producto.precio_lista_usd is not None else None
    return (raiz, sub, producto.nombre, producto.marca, producto.calidad,
            producto.nota, lu)


def cargar(apps, schema_editor):
    Producto = apps.get_model('productos', 'Producto')
    CategoriaProducto = apps.get_model('productos', 'CategoriaProducto')
    Sucursal = apps.get_model('inventario', 'Sucursal')
    StockProducto = apps.get_model('inventario', 'StockProducto')
    MovimientoStock = apps.get_model('inventario', 'MovimientoStock')

    sucursales = {
        'solar': Sucursal.objects.get(nombre='Solar', borrado=False),
        'centro': Sucursal.objects.get(nombre='Centro', borrado=False),
    }
    categorias = {c.nombre: c for c in CategoriaProducto.objects.filter(
        padre__isnull=True, borrado=False)}

    indice = {}
    repetidas = {}
    for p in Producto.objects.filter(borrado=False).select_related(
            'categoria', 'categoria__padre').order_by('id'):
        clave = _clave(p.categoria, p)
        indice[(clave, repetidas.setdefault(clave, 0))] = p
        repetidas[clave] += 1

    # 1. Productos nuevos de las planillas (con su stock).
    pendientes = []
    for item in DATA['crear']:
        categoria = categorias.get(item['categoria'])
        if categoria is None:
            categoria = CategoriaProducto.objects.create(nombre=item['categoria'])
            categorias[item['categoria']] = categoria
        producto, _ = Producto.objects.update_or_create(
            categoria=categoria,
            nombre=item['nombre'],
            marca=item['marca'],
            calidad=item['calidad'],
            nota=item['nota'],
            borrado=False,
            defaults={
                'a_pedido': item['a_pedido'],
                'nuevo': item['nuevo'],
                'precio_lista_usd': Decimal(item['lu']) if item['lu'] else None,
            },
        )
        pendientes.append((producto, item['stock']))

    # 2. Stock de los productos que ya estaban en el catalogo.
    faltantes = []
    for entrada in DATA['stock']:
        producto = indice.get((tuple(entrada['clave']), entrada.get('idx', 0)))
        if producto is None:
            faltantes.append(entrada['clave'])
            continue
        pendientes.append((producto, {
            'solar': entrada['solar'], 'centro': entrada['centro'],
        }))
    if faltantes:
        raise RuntimeError(f'Productos del seed de stock no encontrados: {faltantes[:5]} '
                           f'({len(faltantes)} en total)')

    # 3. Filas de stock + movimiento de carga inicial.
    for producto, cantidades in pendientes:
        for etiqueta, cantidad in cantidades.items():
            if cantidad is None:
                continue
            sucursal = sucursales[etiqueta]
            fila, _ = StockProducto.objects.update_or_create(
                producto=producto, sucursal=sucursal, borrado=False,
                defaults={'cantidad': cantidad},
            )
            if cantidad > 0:
                MovimientoStock.objects.get_or_create(
                    producto=producto, sucursal=sucursal, tipo='ingreso',
                    delta=cantidad, resultante=cantidad,
                    nota='Carga inicial desde planilla (jul 2026)',
                )


def descargar(apps, schema_editor):
    StockProducto = apps.get_model('inventario', 'StockProducto')
    MovimientoStock = apps.get_model('inventario', 'MovimientoStock')
    MovimientoStock.objects.filter(nota='Carga inicial desde planilla (jul 2026)').delete()
    StockProducto.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0002_seed_sucursales'),
        ('productos', '0003_producto_costo_usd'),
    ]

    operations = [
        migrations.RunPython(cargar, descargar),
    ]
