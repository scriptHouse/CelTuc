from django.urls import path

from .views import DocumentoArchivoView, DocumentoDetailView, DocumentoListCreateView

app_name = 'documentos'

urlpatterns = [
    path('', DocumentoListCreateView.as_view(), name='documento-list'),
    path('<int:pk>/', DocumentoDetailView.as_view(), name='documento-detail'),
    path('<int:pk>/archivo/', DocumentoArchivoView.as_view(), name='documento-archivo'),
]
