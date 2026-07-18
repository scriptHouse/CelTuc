from django.urls import path

from .views import (
    EmpleadoAccesoView,
    EmpleadoDetailView,
    EmpleadoListCreateView,
    SucursalDetailView,
    SucursalListCreateView,
)

app_name = 'empleados'

urlpatterns = [
    path('sucursales/', SucursalListCreateView.as_view(), name='sucursales'),
    path('sucursales/<int:pk>/', SucursalDetailView.as_view(), name='sucursal'),
    path('', EmpleadoListCreateView.as_view(), name='list'),
    path('<int:pk>/', EmpleadoDetailView.as_view(), name='detail'),
    path('<int:pk>/acceso/', EmpleadoAccesoView.as_view(), name='acceso'),
]
