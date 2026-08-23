from django.urls import path

from .views import (
    ClientesParaDocumentoView,
    DocumentoArchivoView,
    DocumentoDetailView,
    DocumentoListCreateView,
    EnviarDocumentoEmailView,
    ProximoCuponView,
)

app_name = 'documentos'

urlpatterns = [
    path('', DocumentoListCreateView.as_view(), name='documento-list'),
    # Antes de `<int:pk>/` no hace falta (no colisiona), pero se lee mejor junto.
    path('clientes/', ClientesParaDocumentoView.as_view(), name='documento-clientes'),
    path('proximo-cupon/', ProximoCuponView.as_view(), name='documento-proximo-cupon'),
    path('<int:pk>/', DocumentoDetailView.as_view(), name='documento-detail'),
    path('<int:pk>/archivo/', DocumentoArchivoView.as_view(), name='documento-archivo'),
    path('<int:pk>/enviar-email/', EnviarDocumentoEmailView.as_view(), name='documento-email'),
]
