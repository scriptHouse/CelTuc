from django.urls import path

from .views import (
    ClienteListView,
    ComprobanteDetailView,
    ComprobanteListCreateView,
    EmisorDetailView,
    EmisorListCreateView,
    EmisorProbarConexionView,
    EnviarComprobanteEmailView,
)

app_name = 'facturacion'

urlpatterns = [
    path('emisores/', EmisorListCreateView.as_view(), name='emisor-list'),
    path('emisores/<int:pk>/', EmisorDetailView.as_view(), name='emisor-detail'),
    path('emisores/<int:pk>/probar/', EmisorProbarConexionView.as_view(), name='emisor-probar'),
    path('comprobantes/', ComprobanteListCreateView.as_view(), name='comprobante-list'),
    path('comprobantes/<int:pk>/', ComprobanteDetailView.as_view(), name='comprobante-detail'),
    path('comprobantes/<int:pk>/enviar-email/', EnviarComprobanteEmailView.as_view(), name='comprobante-email'),
    path('clientes/', ClienteListView.as_view(), name='cliente-list'),
]
