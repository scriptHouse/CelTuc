from django.urls import path

from . import views

app_name = 'asistencia'

urlpatterns = [
    # API para los agentes de sucursal (token Bearer asist_…)
    path('agente/eventos/bulk/', views.AgenteEventosBulkView.as_view(), name='agente-eventos-bulk'),
    path('agente/heartbeat/', views.AgenteHeartbeatView.as_view(), name='agente-heartbeat'),
    path('agente/config/', views.AgenteConfigView.as_view(), name='agente-config'),

    # Gestión (solo superadministrador)
    path('panel/', views.PanelAsistenciaView.as_view(), name='panel'),
    path('fichadas/', views.FichadasListView.as_view(), name='fichadas'),
    path('fichadas/<int:pk>/', views.FichadaDetailView.as_view(), name='fichada'),
    path('resumen/', views.ResumenAsistenciaView.as_view(), name='resumen'),
    path('numeros-sin-mapear/', views.NumerosSinMapearView.as_view(), name='numeros-sin-mapear'),
    path('dispositivos/', views.DispositivoListCreateView.as_view(), name='dispositivos'),
    path('dispositivos/<int:pk>/', views.DispositivoDetailView.as_view(), name='dispositivo'),
    path('agentes/', views.AgenteListCreateView.as_view(), name='agentes'),
    path('agentes/<int:pk>/', views.AgenteDetailView.as_view(), name='agente'),
    path('agentes/<int:pk>/regenerar-token/', views.AgenteRegenerarTokenView.as_view(), name='agente-regenerar-token'),
    path('mapeos/', views.MapeoListCreateView.as_view(), name='mapeos'),
    path('mapeos/<int:pk>/', views.MapeoDetailView.as_view(), name='mapeo'),

    # Horarios y licencias
    path('turnos/', views.TurnoListCreateView.as_view(), name='turnos'),
    path('turnos/<int:pk>/', views.TurnoDetailView.as_view(), name='turno'),
    path('asignaciones/', views.AsignacionListCreateView.as_view(), name='asignaciones'),
    path('asignaciones/<int:pk>/', views.AsignacionDetailView.as_view(), name='asignacion'),
    path('licencias/', views.LicenciaListCreateView.as_view(), name='licencias'),
    path('licencias/<int:pk>/', views.LicenciaDetailView.as_view(), name='licencia'),
]
