# -*- coding: utf-8 -*-
"""Filas "(no informado)" de las planillas de stock (jul 2026).

GENERADO por script: segunda pasada sobre "Stock solar.xlsx" y
"Stock.xlsx Centro.xlsx" para las filas de las secciones de stock cuya celda
de cantidad estaba VACIA (el seed 0003 las habia salteado). Cada una queda
como StockProducto con cantidad=0 y sin_dato=True — el front lo muestra como
"(no informado)" — SIN movimiento de kardex (no entro mercaderia). Los
productos de esas filas que no estaban en el catalogo se crean aca, con su
precio de lista USD si la planilla lo traia.

No pisa filas de stock existentes ni modifica precios ni el dolar.
"""
from decimal import Decimal

from django.db import migrations

DATA = {
 "crear": [
  {
   "categoria": "Auriculares",
   "nombre": "Haylou X1 Neo",
   "marca": "Haylou",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "25.5",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Auriculares",
   "nombre": "JBL Wave Flex",
   "marca": "JBL",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "102",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Auriculares",
   "nombre": "Redmi Buds 6 ( Con cancelacion de sonido )",
   "marca": "Xiaomi",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "69.36",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Auriculares",
   "nombre": "Redmi Buds 6 Pro ( Con cancelacion de sonido )",
   "marca": "Xiaomi",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "110.16",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Auriculares",
   "nombre": "Replica Airpods 2da",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "25.5",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Auriculares",
   "nombre": "Replica Airpods 3ra",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "30.6",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Consolas",
   "nombre": "Xbox Series X 1TB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "1018.725",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "Airpods Max",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": True,
   "nuevo": False,
   "lu": "630",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "Macbook Air M5 13'' 16/1TB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "1650",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "Macbook Air M5 13'' 24/1TB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "1899",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "Macbook Air M5 15'' 16/1TB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "1899",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "Macbook Air M5 15'' 16/512GB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "1599",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "iPad Air M4 13'' 128GB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": True,
   "nuevo": False,
   "lu": "999",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "iPad Air M4 13'' 256GB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": True,
   "nuevo": False,
   "lu": "1140",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "iPad Pro M5 11'' 512GB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": True,
   "nuevo": False,
   "lu": None,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Productos Apple",
   "nombre": "iPad Pro M5 13'' 512GB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": True,
   "nuevo": False,
   "lu": None,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Samsung",
   "nombre": "S25 Plus 12GB/256GB",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": True,
   "nuevo": False,
   "lu": "920",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Smartwatch",
   "nombre": "Imilab KW66",
   "marca": "Imilab",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "56.1",
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "categoria": "Smartwatch",
   "nombre": "Replica Blulory Ultra Pro",
   "marca": "",
   "calidad": "",
   "nota": "",
   "a_pedido": False,
   "nuevo": False,
   "lu": "71.4",
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Auricular iPhone Entrada Aux",
    "",
    "Calidad original",
    "",
    "12.24"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Quantum 100 M2",
    "JBL",
    "",
    "",
    "70.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Auriculares",
    None,
    "JBL Tune 110 Entrada 3.5mm",
    "JBL",
    "",
    "",
    "17.34"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Redmi Buds 6 Active",
    "Redmi",
    "",
    "",
    "29.58"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Replica Airpods 4ta",
    "",
    "",
    "",
    "50.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Auriculares",
    None,
    "Replica Airpods Max Premium",
    "",
    "",
    "",
    "50.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable Lightning a USB 2M",
    "",
    "Calidad original",
    "",
    "12.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Cables",
    None,
    "Cable USB-C a Lightning 2M",
    "",
    "Apple original",
    "",
    "55.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Cables",
    None,
    "Cargador Apple Watch USB-C WUW",
    "Apple",
    "",
    "",
    "20.40"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Cables",
    None,
    "Splitter",
    "",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB a Lightning",
    "Cable USB a Lightning 1M TRV",
    "TRV",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB a Lightning",
    "Cable USB a Lightning 1M iGlufive",
    "iGlufive",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB",
    "Cable USB-C a USB 1M TRV",
    "TRV",
    "",
    "",
    "10.20"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB",
    "Cable USB-C a USB 1M TRV ( Suelto )",
    "TRV",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB",
    "Cable USB-C a USB 1M iGlufive",
    "iGlufive",
    "",
    "",
    "9.18"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C 1.5M Samsung",
    "Samsung",
    "Calidad original",
    "",
    "9.18"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C 1M Ringke",
    "Ringke",
    "Original",
    "",
    "25.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C Power Link CLD",
    "CLD",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Cables",
    "USB-C a USB-C",
    "Cable USB-C a USB-C Silicone Color CLD",
    "CLD",
    "",
    "",
    "8.16"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Consolas",
    None,
    "Nintendo Switch 64GB Oled",
    "Nintendo",
    "",
    "",
    "636.23"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Consolas",
    None,
    "PlayStation 5 Pro 2TB ( solo viene digital )",
    "PlayStation",
    "",
    "",
    "1748.75"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Consolas",
    None,
    "PlayStation 5 Slim 1TB Digital",
    "PlayStation",
    "",
    "",
    "912.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Consolas",
    None,
    "PlayStation Portal ( consola portatil )",
    "PlayStation",
    "",
    "",
    "420.75"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Cargador MagSafe iPhone 1M",
    "",
    "Apple original",
    "",
    "76.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente 20W",
    "",
    "Calidad original",
    "Precio si compran equipo",
    "23.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente 20W",
    "",
    "Apple original",
    "Precio si compran equipo",
    "50.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente 5W",
    "",
    "Calidad original",
    "",
    "12.24"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente Motorola TIPO C / TIPO C 30W + CABLE",
    "Motorola",
    "Calidad original",
    "",
    "22.44"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente Samsung TIPO C / TIPO C 25W + CABLE",
    "Samsung",
    "Calidad original",
    "",
    "27.54"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Fuente Xiaomi 5W SIN CAJA",
    "Xiaomi",
    "Original",
    "",
    "7.14"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "G-Tide PowerBank 10000 mAh",
    "G-Tide",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "MacBook USB-C 67W",
    "",
    "Calidad original",
    "",
    "112.20"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Fuentes de carga y powerbanks",
    None,
    "Xiaomi PowerBank 10000 mAh ( caja azul )",
    "Xiaomi",
    "",
    "",
    "33.66"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Fundas",
    None,
    "Ringke Fusion Magnetic",
    "Ringke",
    "",
    "",
    "45.90"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Fundas",
    None,
    "Ringke Slim Para Airtag",
    "Ringke",
    "",
    "",
    "15.30"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Fundas",
    None,
    "Spigen Core Armor Magsafe 16",
    "Spigen",
    "",
    "",
    "51.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Fundas",
    None,
    "Spigen Ultra Hybrid",
    "Spigen",
    "",
    "",
    "56.10"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Fundas",
    None,
    "Spigen Ultra Hybrid Magfit",
    "Spigen",
    "",
    "",
    "61.20"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Dot Max",
    "Alexa",
    "",
    "",
    "254.36"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Parlantes",
    None,
    "Alexa Echo Show 15",
    "Alexa",
    "",
    "",
    "605.63"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Parlantes",
    None,
    "BoomBox 3",
    "JBL",
    "",
    "",
    "620.16"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Parlantes",
    None,
    "PartyBox 520",
    "JBL",
    "",
    "",
    "1211.25"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Parlantes",
    None,
    "PartyBox Club 120",
    "JBL",
    "",
    "",
    "823.65"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Parlantes",
    None,
    "PartyBox Stage 320",
    "JBL",
    "",
    "",
    "1090.13"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Airpods Max 2",
    "Apple",
    "",
    "",
    "650.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple TV 3ra Gen 128GB",
    "Apple",
    "",
    "",
    "290.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple TV 3ra Gen 64GB",
    "Apple",
    "",
    "",
    "250.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series SE 2 40mm",
    "Apple",
    "",
    "",
    "320.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Apple Watch Series Ultra 3 49mm",
    "Apple",
    "",
    "",
    "899.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Macbook Pro 14'' M5 16/512GB",
    "Apple",
    "",
    "",
    "1880.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Macbook Pro 14'' M5 24/1TB",
    "Apple",
    "",
    "",
    "2399.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Macbook Pro 14'' M5 Pro 24/1TB",
    "Apple",
    "",
    "",
    "2650.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Magic Mouse USB-C",
    "Apple",
    "",
    "",
    "140.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "Pencil USB-C",
    "Apple",
    "Calidad original",
    "",
    "70.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad 11va Gen (A16) 256GB",
    "Apple",
    "",
    "",
    "599.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad Air M3 11'' 256GB",
    "Apple",
    "",
    "",
    "799.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Productos Apple",
    None,
    "iPad Mini 128GB",
    "Apple",
    "",
    "",
    "630.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Samsung",
    None,
    "S26 12GB/256GB",
    "Samsung",
    "",
    "",
    "899.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Samsung",
    None,
    "S26 Plus 12GB/256GB",
    "Samsung",
    "",
    "",
    "1150.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "S9 Ultra",
    "",
    "",
    "",
    "56.10"
   ],
   "idx": 0,
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Smartwatch",
    None,
    "T500",
    "",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Hidrogel Tablet o iPad",
    "",
    "",
    "",
    "30.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Templados y protectores",
    None,
    "Templado Spigen Glas.tr Slim HD 16Pro/17/17Pro",
    "Spigen",
    "",
    "",
    "25.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Adaptador OTG USB-C a USB",
    "",
    "",
    "",
    "22.44"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Belkin auto 12W/2,4amp",
    "Belkin",
    "",
    "",
    "32.64"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Camara Vehicular + Rear Camera SJCAM M60 2CH ( frontal y reversa )",
    "SJCAM",
    "",
    "",
    "295.80"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Camara Vehicular SJCAM M60 1CH ( frontal )",
    "SJCAM",
    "",
    "",
    "255.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Camara Vehicular Sate A-DVR005 3CH ( frontal, interior y reversa )",
    "SATE",
    "",
    "",
    "86.70"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Camara Vehicular Sate A-DVR006 3CH ( frontal, interior y reversa )",
    "SATE",
    "",
    "",
    "71.40"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Camara Vehicular Sate A-DVR007 3CH ( frontal, interior y reversa )",
    "SATE",
    "",
    "",
    "102.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Camara Vehicular Sate A-DVR051 2CH ( frontal y reversa )",
    "SATE",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Convertidor Google Chromecast 4 with Google TV",
    "Google",
    "",
    "",
    "112.20"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Convertidor Smart Tv Onn Google 4K",
    "Google",
    "",
    "",
    "71.40"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Convertidor Smart Tv Onn Google FHD",
    "Google",
    "",
    "",
    "61.20"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Convertidor Xiaomi Mi Tv Stick 4K",
    "Xiaomi",
    "",
    "",
    "91.80"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Funda Airpods Case Leather Cuero (para todos los modelos)",
    "",
    "",
    "",
    "11.22"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Joystick DualShock PS4",
    "",
    "",
    "",
    "117.30"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Joystick Xbox + Cable",
    "Xbox",
    "",
    "",
    "140.76"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Malla Simil Cuero Apple Watch",
    "Apple",
    "",
    "Mallas 38/40/41/42 mm compatibles entre sí; 42/44/45/46/49 mm entre sí",
    "25.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Microfono Corbatero Doble K9 VOZK",
    "",
    "",
    "",
    "24.48"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Microfono Corbatero Doble SATE",
    "SATE",
    "",
    "",
    "44.88"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Mouse Inalambrico Logitech M170",
    "Logitech",
    "",
    "",
    "14.28"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Pencil Midi Pro Stylus Pen ( compatible con todos los iPads )",
    "",
    "",
    "",
    "44.88"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Teclado + Mouse Logitech MK235",
    "Logitech",
    "",
    "",
    "33.66"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Tira Piedras para colgar",
    "",
    "",
    "",
    "12.24"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Mi 37W Car Charger",
    "Xiaomi",
    "",
    "",
    "25.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Mi Light Detection",
    "Xiaomi",
    "",
    "",
    "25.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Mi Temperature and Humidity Monitor 3",
    "Xiaomi",
    "",
    "",
    "40.80"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi Night Light 3",
    "Xiaomi",
    "",
    "",
    "51.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    None,
    "Xiaomi mi Smart Despertador",
    "Xiaomi",
    "",
    "",
    "132.60"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Funda con cierre MacBook O NoteBook 15-16''",
    "",
    "",
    "",
    "50.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "centro"
   ]
  },
  {
   "clave": [
    "Varios",
    "Accesorios iPad y MacBook",
    "Smart Keyboard CASE ( teclado para ipad 11va Gen y Air m3 11'' )",
    "",
    "",
    "",
    "100.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Note 14 Pro 4G 8GB/256GB",
    "Xiaomi",
    "",
    "",
    "382.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Note 15 Pro 5G 8GB/256GB",
    "Xiaomi",
    "",
    "",
    "510.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "POCO C75 8GB/256GB",
    "POCO",
    "",
    "",
    "229.50"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "POCO M6 PRO 8GB/256GB",
    "POCO",
    "",
    "",
    "318.75"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Redmi 15 8GB/256GB",
    "Redmi",
    "",
    "",
    "318.75"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
  },
  {
   "clave": [
    "Xiaomi",
    None,
    "Redmi A3x 4GB/128GB",
    "Redmi",
    "",
    "",
    "153.00"
   ],
   "idx": 0,
   "sucursales": [
    "centro",
    "solar"
   ]
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
   "sucursales": [
    "solar"
   ]
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

    # 1. Productos nuevos de las planillas (filas sin cantidad informada).
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
        pendientes.append((producto, item['sucursales']))

    # 2. Productos que ya estaban en el catalogo.
    faltantes = []
    for entrada in DATA['stock']:
        producto = indice.get((tuple(entrada['clave']), entrada.get('idx', 0)))
        if producto is None:
            faltantes.append(entrada['clave'])
            continue
        pendientes.append((producto, entrada['sucursales']))
    if faltantes:
        raise RuntimeError(f'Productos del seed no-informado no encontrados: {faltantes[:5]} '
                           f'({len(faltantes)} en total)')

    # 3. Fila "(no informado)": cantidad 0 + sin_dato. Sin movimiento (no entro
    #    nada) y sin pisar filas que ya existen (su cantidad SI esta informada).
    for producto, etiquetas in pendientes:
        for etiqueta in etiquetas:
            StockProducto.objects.get_or_create(
                producto=producto, sucursal=sucursales[etiqueta], borrado=False,
                defaults={'cantidad': 0, 'sin_dato': True},
            )


def descargar(apps, schema_editor):
    StockProducto = apps.get_model('inventario', 'StockProducto')
    StockProducto.objects.filter(sin_dato=True, cantidad=0).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0005_stockproducto_sin_dato'),
    ]

    operations = [
        migrations.RunPython(cargar, descargar),
    ]
