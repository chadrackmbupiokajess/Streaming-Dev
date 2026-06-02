from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CameraViewSet, StreamViewSet

router = DefaultRouter()
router.register(r'cameras', CameraViewSet)
router.register(r'streams', StreamViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
]
