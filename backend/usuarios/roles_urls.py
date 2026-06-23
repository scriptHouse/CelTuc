from django.urls import path

from .roles import PermisoListView, RolDetailView, RolListCreateView

app_name = 'roles'

urlpatterns = [
    path('roles/', RolListCreateView.as_view(), name='list'),
    path('roles/<int:pk>/', RolDetailView.as_view(), name='detail'),
    path('permisos/', PermisoListView.as_view(), name='permisos'),
]
