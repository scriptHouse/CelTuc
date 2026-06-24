from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Usuario
from .serializers import LoginSerializer, RefreshSerializer, UsuarioSerializer
from .tokens import create_token_pair, decode_token


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
        return Response(create_token_pair(user))


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
