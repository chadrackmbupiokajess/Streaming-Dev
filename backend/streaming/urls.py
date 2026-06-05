from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .auth_views import (
    BootstrapStatusView,
    BootstrapView,
    LoginView,
    LogoutView,
    MeView,
    SourceAccountView,
)
from .views import AudioSourceViewSet, AudioStreamViewSet, CameraViewSet, StreamViewSet

router = DefaultRouter()
router.register(r'cameras', CameraViewSet)
router.register(r'audio-sources', AudioSourceViewSet)
router.register(r'streams', StreamViewSet)
router.register(r'audio-streams', AudioStreamViewSet)

urlpatterns = [
    path('api/auth/bootstrap-status/', BootstrapStatusView.as_view(), name='auth-bootstrap-status'),
    path('api/auth/bootstrap/', BootstrapView.as_view(), name='auth-bootstrap'),
    path('api/auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('api/auth/me/', MeView.as_view(), name='auth-me'),
    path('api/auth/source-accounts/', SourceAccountView.as_view(), name='auth-source-accounts'),
    path('api/', include(router.urls)),
]
