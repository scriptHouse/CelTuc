from django.urls import path

from .views import AuditoriaListView

app_name = 'auditoria'

urlpatterns = [
    path('', AuditoriaListView.as_view(), name='list'),
]
