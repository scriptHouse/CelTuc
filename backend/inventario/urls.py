from django.urls import path

from . import views

urlpatterns = [
    path('sucursales/', views.SucursalListCreateView.as_view(), name='inv-sucursales'),
    path('sucursales/<int:pk>/', views.SucursalDetailView.as_view(), name='inv-sucursal'),
    path('stock/', views.StockListView.as_view(), name='inv-stock'),
    path('stock/ajustar/', views.AjustarStockView.as_view(), name='inv-stock-ajustar'),
    path('stock/transferir/', views.TransferirStockView.as_view(), name='inv-stock-transferir'),
    path('ventas/', views.VentasView.as_view(), name='inv-ventas'),
    path('movimientos/', views.MovimientoListView.as_view(), name='inv-movimientos'),
]
