"""Rutas raiz del proyecto CelTuc."""
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health_check(_request):
    """Endpoint liviano para el HEALTHCHECK del contenedor."""
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/auth/', include('usuarios.urls')),
    path('api/usuarios/', include('usuarios.gestion_urls')),
    path('api/empleados/', include('empleados.urls')),
]
