from django.urls import path

from .views import (
    ArchivoDescargaView,
    ComunicadoDetailView,
    ComunicadoListCreateView,
    MarcarVistoView,
)

app_name = 'comunicados'

urlpatterns = [
    path('', ComunicadoListCreateView.as_view(), name='comunicado-list'),
    path('<int:pk>/', ComunicadoDetailView.as_view(), name='comunicado-detail'),
    path('<int:pk>/visto/', MarcarVistoView.as_view(), name='comunicado-visto'),
    path('archivos/<int:pk>/', ArchivoDescargaView.as_view(), name='archivo-descarga'),
]
