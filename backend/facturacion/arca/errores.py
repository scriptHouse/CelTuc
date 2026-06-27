"""Excepcion unica de la integracion con ARCA.

Las vistas la atrapan y devuelven un mensaje claro al frontend. ``detalle``
guarda informacion extra (observaciones u errores que devuelve ARCA) para
mostrarla o registrarla sin romper el flujo.
"""


class ErrorARCA(Exception):
    """Algo fallo al hablar con ARCA (credenciales, red, rechazo de un CAE...)."""

    def __init__(self, mensaje: str, detalle=None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.detalle = detalle

    def __str__(self):
        if self.detalle:
            return f'{self.mensaje} ({self.detalle})'
        return self.mensaje
