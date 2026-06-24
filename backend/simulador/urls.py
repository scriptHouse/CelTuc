from django.urls import path

from .views import TarjetaDetailView, TarjetaListCreateView

app_name = 'simulador'

urlpatterns = [
    path('tarjetas/', TarjetaListCreateView.as_view(), name='list'),
    path('tarjetas/<int:pk>/', TarjetaDetailView.as_view(), name='detail'),
]
