from django.urls import path

from .views import EmpleadoAccesoView, EmpleadoDetailView, EmpleadoListCreateView

app_name = 'empleados'

urlpatterns = [
    path('', EmpleadoListCreateView.as_view(), name='list'),
    path('<int:pk>/', EmpleadoDetailView.as_view(), name='detail'),
    path('<int:pk>/acceso/', EmpleadoAccesoView.as_view(), name='acceso'),
]
