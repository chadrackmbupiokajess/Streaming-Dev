from django.db.models import Q

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .consumers import get_live_camera_ids
from .models import Camera, Stream
from .notifications import notify_viewers_selection
from .serializers import CameraSerializer, StreamSerializer

class CameraViewSet(viewsets.ModelViewSet):
    queryset = Camera.objects.all()
    serializer_class = CameraSerializer

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        camera = self.get_object()
        camera.is_active = True
        camera.save()
        return Response({'status': 'activated'})

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        camera = self.get_object()
        camera.is_active = False
        camera.save()
        return Response({'status': 'deactivated'})

    @action(detail=False, methods=['get'])
    def live(self, request):
        """Caméras qui envoient un flux en ce moment (WebSocket producteur actif)."""
        live_ids = get_live_camera_ids()
        cameras = Camera.objects.filter(id__in=live_ids, is_active=True)
        serializer = self.get_serializer(cameras, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def cleanup_session(self, request):
        """Désactive les entrées fantômes (ancien format ou session arrêtée)."""
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({'error': 'session_id requis'}, status=status.HTTP_400_BAD_REQUEST)

        live_ids = get_live_camera_ids()
        stale = Camera.objects.filter(is_active=True).filter(
            Q(device_id=session_id) | Q(device_id__startswith=f'{session_id}__')
        ).exclude(id__in=live_ids)

        count = stale.update(is_active=False)
        return Response({'deactivated': count})

    @action(detail=True, methods=['post'])
    def select_for_viewer(self, request, pk=None):
        Stream.objects.all().update(is_selected=False)

        camera = self.get_object()
        camera.is_active = True
        camera.save()

        stream, _ = Stream.objects.update_or_create(
            camera=camera,
            defaults={'is_active': True, 'is_selected': True, 'ended_at': None},
        )

        notify_viewers_selection(camera.id, camera.name)

        return Response({
            'status': 'live',
            'camera_id': camera.id,
            'camera_name': camera.name,
            'stream_id': stream.id,
        })

class StreamViewSet(viewsets.ModelViewSet):
    queryset = Stream.objects.all()
    serializer_class = StreamSerializer

    @action(detail=False, methods=['get'])
    def current_selected(self, request):
        selected_stream = Stream.objects.filter(is_selected=True, is_active=True).first()
        if selected_stream:
            return Response({
                'camera_id': selected_stream.camera.id,
                'camera_name': selected_stream.camera.name
            })
        return Response({'status': 'none'}, status=status.HTTP_404_NOT_FOUND)
