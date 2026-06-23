from django.urls import path

from .gestion import UsuarioDetailView, UsuarioListCreateView

app_name = 'usuarios_gestion'

urlpatterns = [
    path('', UsuarioListCreateView.as_view(), name='list'),
    path('<int:pk>/', UsuarioDetailView.as_view(), name='detail'),
]
