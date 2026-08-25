from django.urls import path

from .views import (
    HeartbeatView,
    ImpersonacionCanjeView,
    LoginView,
    MeView,
    RefreshView,
)

app_name = 'usuarios'

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('refresh/', RefreshView.as_view(), name='refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('heartbeat/', HeartbeatView.as_view(), name='heartbeat'),
    # Canje del pase que emite el boton "Impersonar" del admin de Django.
    path('impersonar/canjear/', ImpersonacionCanjeView.as_view(), name='impersonar-canjear'),
]
