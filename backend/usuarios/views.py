from datetime import datetime

from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from auditoria.registro import registrar_ingreso

from .impersonacion import claims_para, motivo_no_impersonable
from .models import TicketImpersonacion, Usuario
from .serializers import LoginSerializer, RefreshSerializer, UsuarioSerializer
from .tokens import claims_impersonacion, create_token_pair, decode_token


class LoginView(APIView):
    """Inicio de sesion con email O nombre de usuario + contrasena.

    Devuelve el par de tokens JWT y los datos del usuario. El throttle por scope
    'login' (ver settings) limita los intentos para frenar fuerza bruta.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = 'login'

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        # Auditoria: registramos el inicio de sesion y arrancamos la presencia.
        ahora = timezone.now()
        Usuario.objects.filter(pk=user.pk).update(last_login=ahora, ultima_actividad=ahora)
        user.last_login = ahora
        user.ultima_actividad = ahora
        # El ingreso queda en el historial de auditoria (nunca rompe el login).
        registrar_ingreso(user, request)
        return Response({
            **create_token_pair(user),
            'user': UsuarioSerializer(user).data,
        })


class RefreshView(APIView):
    """Renueva el par de tokens a partir de un refresh token valido."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = decode_token(serializer.validated_data['refresh'], expected_type='refresh')
        user = Usuario.objects.filter(pk=payload.get('sub'), is_active=True).first()
        if user is None:
            return Response(
                {'detail': 'Usuario no encontrado o inactivo.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        # Si es una sesion impersonada, el par nuevo conserva la marca del actor
        # y su limite absoluto; ademas se revalida que siga siendo superadmin.
        extra = claims_impersonacion(payload)
        if extra and not Usuario.objects.filter(
            pk=extra['act'], is_active=True, is_superuser=True
        ).exists():
            return Response(
                {'detail': 'La impersonacion ya no es valida.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response(create_token_pair(user, extra))


class MeView(generics.RetrieveAPIView):
    """Datos del usuario autenticado (a partir del token Bearer)."""

    serializer_class = UsuarioSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class HeartbeatView(APIView):
    """Latido de presencia.

    El front lo llama cada pocos minutos mientras la cuenta esta activa (pestaña
    visible + interaccion reciente). La marca de `ultima_actividad` la hace
    JWTAuthentication con su throttle; aca solo confirmamos recepcion, sin cuerpo.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImpersonacionCanjeView(APIView):
    """Canjea el pase de un solo uso por una sesion de la cuenta impersonada.

    El pase lo emite el admin de Django (boton "Impersonar") y llega en el
    fragmento de la URL, asi que el frontend es el unico que lo ve. Aca se quema
    y se vuelven a chequear TODAS las reglas: entre que se emitio y se canjeo
    pudieron desactivar la cuenta o quitarle el poder al superadministrador.
    """

    permission_classes = [permissions.AllowAny]
    throttle_scope = 'login'

    def post(self, request):
        pase = (request.data.get('ticket') or '').strip()
        ticket = TicketImpersonacion.canjear(pase)
        if ticket is None:
            return Response(
                {'detail': 'El pase de impersonacion no es valido, ya se uso o vencio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        motivo = motivo_no_impersonable(ticket.actor, ticket.objetivo)
        if motivo is not None:
            return Response({'detail': motivo}, status=status.HTTP_403_FORBIDDEN)

        extra = claims_para(ticket.actor)
        return Response({
            **create_token_pair(ticket.objetivo, extra),
            'user': UsuarioSerializer(ticket.objetivo).data,
            'impersonacion': {
                'actor': {'id': ticket.actor.pk, 'username': ticket.actor.username},
                'expira': datetime.fromtimestamp(
                    extra['imp_exp'], tz=timezone.get_current_timezone(),
                ).isoformat(),
            },
        })
