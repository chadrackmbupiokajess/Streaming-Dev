from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Camera, Stream
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

    @action(detail=True, methods=['post'])
    def select_for_viewer(self, request, pk=None):
        # Désélectionner toutes les caméras dans les Streams
        Stream.objects.all().update(is_selected=False)
        
        camera = self.get_object()
        # Trouver ou créer le stream actif pour cette caméra
        stream, created = Stream.objects.get_or_create(camera=camera, is_active=True)
        stream.is_selected = True
        stream.save()
        
        return Response({'status': f'Camera {camera.name} is now LIVE for viewers'})

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
