from django.urls import path

from . import views

urlpatterns = [
    path('config/', views.ConfigView.as_view(), name='caja-config'),
    path('cajas/', views.CajaListCreateView.as_view(), name='caja-cajas'),
    path('cajas/<int:pk>/', views.CajaDetailView.as_view(), name='caja-caja'),
    path('cajas/<int:pk>/estado/', views.EstadoCajaView.as_view(), name='caja-estado'),
    path('abiertas/', views.AbiertasView.as_view(), name='caja-abiertas'),
    path('abrir/', views.AbrirCajaView.as_view(), name='caja-abrir'),
    path('movimientos/', views.MovimientosView.as_view(), name='caja-movimientos'),
    path('movimientos/<int:pk>/', views.MovimientoDetailView.as_view(), name='caja-movimiento'),
    path('cerrar/', views.CerrarCajaView.as_view(), name='caja-cerrar'),
    path('cierres/', views.CierresView.as_view(), name='caja-cierres'),
]
