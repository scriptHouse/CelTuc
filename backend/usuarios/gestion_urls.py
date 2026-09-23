from django.urls import path

from .gestion import DisponibilidadView, UsuarioDetailView, UsuarioListCreateView

app_name = 'usuarios_gestion'

urlpatterns = [
    path('', UsuarioListCreateView.as_view(), name='list'),
    path('disponibilidad/', DisponibilidadView.as_view(), name='disponibilidad'),
    path('<int:pk>/', UsuarioDetailView.as_view(), name='detail'),
]
