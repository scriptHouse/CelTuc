from django.urls import path

from .views import (
    CategoriaDetailView,
    CategoriaListCreateView,
    ConfiguracionProductosView,
    ProductoDetailView,
    ProductoListCreateView,
)

app_name = 'productos'

urlpatterns = [
    path('configuracion/', ConfiguracionProductosView.as_view(), name='configuracion'),
    path('categorias/', CategoriaListCreateView.as_view(), name='categorias'),
    path('categorias/<int:pk>/', CategoriaDetailView.as_view(), name='categoria'),
    path('items/', ProductoListCreateView.as_view(), name='items'),
    path('items/<int:pk>/', ProductoDetailView.as_view(), name='item'),
]
