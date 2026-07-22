from django.urls import path

from .views import PreferenciaView

app_name = 'comun'

urlpatterns = [
    path('<str:clave>/', PreferenciaView.as_view(), name='preferencia'),
]
