from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/stream/(?P<camera_id>[^/]+)/$', consumers.StreamConsumer.as_asgi()),
    re_path(r'ws/admin/$', consumers.AdminConsumer.as_asgi()),
    re_path(r'ws/viewer/$', consumers.ViewerConsumer.as_asgi()),
]
