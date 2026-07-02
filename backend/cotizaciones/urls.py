from django.urls import path

from .views import (
    ModeloEquipoDetailView,
    ModeloEquipoListCreateView,
    TipoServicioDetailView,
    TipoServicioListCreateView,
)

app_name = 'cotizaciones'

urlpatterns = [
    path('modelos/', ModeloEquipoListCreateView.as_view(), name='modelos'),
    path('modelos/<int:pk>/', ModeloEquipoDetailView.as_view(), name='modelo'),
    path('tipos-servicio/', TipoServicioListCreateView.as_view(), name='tipos'),
    path('tipos-servicio/<int:pk>/', TipoServicioDetailView.as_view(), name='tipo'),
]
