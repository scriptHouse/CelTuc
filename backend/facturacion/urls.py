from django.urls import path

from .views import (
    ComprobanteDetailView,
    ComprobanteListCreateView,
    EmisorDetailView,
    EmisorListCreateView,
    EmisorProbarConexionView,
)

app_name = 'facturacion'

urlpatterns = [
    path('emisores/', EmisorListCreateView.as_view(), name='emisor-list'),
    path('emisores/<int:pk>/', EmisorDetailView.as_view(), name='emisor-detail'),
    path('emisores/<int:pk>/probar/', EmisorProbarConexionView.as_view(), name='emisor-probar'),
    path('comprobantes/', ComprobanteListCreateView.as_view(), name='comprobante-list'),
    path('comprobantes/<int:pk>/', ComprobanteDetailView.as_view(), name='comprobante-detail'),
]
