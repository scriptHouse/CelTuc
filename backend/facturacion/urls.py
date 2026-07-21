from django.urls import path

from .views import (
    ClienteDetailView,
    ClienteListView,
    ComprobanteDetailView,
    ComprobanteListCreateView,
    EmisorDetailView,
    EmisorLimitesView,
    EmisorListCreateView,
    EmisorProbarConexionView,
    EnviarComprobanteEmailView,
)

app_name = 'facturacion'

urlpatterns = [
    path('emisores/', EmisorListCreateView.as_view(), name='emisor-list'),
    path('emisores/<int:pk>/', EmisorDetailView.as_view(), name='emisor-detail'),
    path('emisores/<int:pk>/probar/', EmisorProbarConexionView.as_view(), name='emisor-probar'),
    path('emisores/<int:pk>/limites/', EmisorLimitesView.as_view(), name='emisor-limites'),
    path('comprobantes/', ComprobanteListCreateView.as_view(), name='comprobante-list'),
    path('comprobantes/<int:pk>/', ComprobanteDetailView.as_view(), name='comprobante-detail'),
    path('comprobantes/<int:pk>/enviar-email/', EnviarComprobanteEmailView.as_view(), name='comprobante-email'),
    path('clientes/', ClienteListView.as_view(), name='cliente-list'),
    path('clientes/<int:pk>/', ClienteDetailView.as_view(), name='cliente-detail'),
]
