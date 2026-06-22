from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Usuario
from .serializers import LoginSerializer, RefreshSerializer, UsuarioSerializer
from .tokens import create_token_pair, decode_token


class LoginView(APIView):
    """Inicio de sesion con email + contrasena. Devuelve el par de tokens JWT
    y los datos del usuario."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = 'login'

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        return Response({
            **create_token_pair(user),
            'user': UsuarioSerializer(user, context={'request': request}).data,
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


class MeView(generics.RetrieveUpdateAPIView):
    """Datos del usuario autenticado (GET) y edicion de sus datos personales
    (PATCH/PUT)."""

    serializer_class = UsuarioSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user
