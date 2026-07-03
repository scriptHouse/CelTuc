from django.urls import path

from .views import (
    ConfiguracionServiceView,
    ItemDetailView,
    ItemListCreateView,
    SeccionDetailView,
    SeccionListCreateView,
)

app_name = 'precios_service'

urlpatterns = [
    path('configuracion/', ConfiguracionServiceView.as_view(), name='configuracion'),
    path('secciones/', SeccionListCreateView.as_view(), name='secciones'),
    path('secciones/<int:pk>/', SeccionDetailView.as_view(), name='seccion'),
    path('items/', ItemListCreateView.as_view(), name='items'),
    path('items/<int:pk>/', ItemDetailView.as_view(), name='item'),
]
