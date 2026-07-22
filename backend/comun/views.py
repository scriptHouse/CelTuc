"""API de preferencias globales (clave -> valor compartido por todo el equipo).

Guarda configuraciones chicas que deben valer en todos los dispositivos (ej:
la plantilla del mensaje de WhatsApp de facturacion). No es un almacen
arbitrario: solo existen las claves declaradas en ``CLAVES_PREFERENCIAS``,
cada una con el permiso de modulo que hace falta para usarla.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from usuarios.permissions import LecturaYEscrituraConPermiso

from .models import Preferencia

# Registro de claves validas -> permiso de modulo requerido (o None si alcanza
# con estar autenticado). Agregar aca la clave al sumar una preferencia nueva.
CLAVES_PREFERENCIAS = {
    'facturacion.mensaje_whatsapp': 'ver_facturacion',
    'cotizaciones.mensaje_whatsapp': 'ver_cotizaciones',
}

# Tope holgado para plantillas de texto; corta un mal uso, no un uso real.
MAX_LARGO_VALOR = 10_000


class PreferenciaView(APIView):
    """GET: valor actual ('' si no se personalizo). PUT: lo guarda (upsert).

    Lectura y escritura con el permiso del modulo dueño de la clave (patron
    `LecturaYEscrituraConPermiso`): configurar la plantilla es una operacion
    de mostrador, igual que usarla.
    """

    permission_classes = [LecturaYEscrituraConPermiso]

    @property
    def permiso_requerido(self):
        return CLAVES_PREFERENCIAS.get(self.kwargs.get('clave', ''))

    def get(self, request, clave):
        if clave not in CLAVES_PREFERENCIAS:
            return Response({'detail': 'Preferencia desconocida.'},
                            status=status.HTTP_404_NOT_FOUND)
        pref = Preferencia.objects.filter(clave=clave).first()
        return Response({'clave': clave, 'valor': pref.valor if pref else ''})

    def put(self, request, clave):
        if clave not in CLAVES_PREFERENCIAS:
            return Response({'detail': 'Preferencia desconocida.'},
                            status=status.HTTP_404_NOT_FOUND)
        valor = request.data.get('valor')
        if not isinstance(valor, str):
            return Response({'detail': 'Falta "valor" (texto).'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(valor) > MAX_LARGO_VALOR:
            return Response({'detail': f'El valor supera los {MAX_LARGO_VALOR} caracteres.'},
                            status=status.HTTP_400_BAD_REQUEST)

        pref = Preferencia.objects.filter(clave=clave).first()
        if pref:
            pref.valor = valor
            pref.actualizado_por = request.user
            pref.save(update_fields=['valor', 'actualizado_por'])
        else:
            pref = Preferencia.objects.create(
                clave=clave, valor=valor,
                creado_por=request.user, actualizado_por=request.user,
            )
        return Response({'clave': clave, 'valor': pref.valor})
