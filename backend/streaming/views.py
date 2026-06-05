from django.db.models import Q

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .auth_utils import is_source_user
from .consumers import get_live_audio_ids, get_live_camera_ids
from .models import AudioSource, AudioStream, Camera, Stream
from .notifications import (
    notify_admin_live_sources_changed,
    notify_viewers_audio_selection,
    notify_viewers_selection,
)
from .permissions import IsRegieUser, IsSourceOrRegieUser
from .serializers import (
    AudioSourceSerializer,
    AudioStreamSerializer,
    CameraSerializer,
    StreamSerializer,
)


class CameraViewSet(viewsets.ModelViewSet):
    queryset = Camera.objects.all().order_by('name', 'id')
    serializer_class = CameraSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if is_source_user(self.request.user):
            return queryset.filter(owner=self.request.user)
        return queryset

    def get_permissions(self):
        if self.action in {'register_source', 'deactivate_source', 'cleanup_session'}:
            permission_classes = [permissions.IsAuthenticated, IsSourceOrRegieUser]
        elif self.action in {'live', 'select_for_viewer', 'list', 'retrieve'}:
            permission_classes = [permissions.IsAuthenticated, IsRegieUser]
        else:
            permission_classes = [permissions.IsAuthenticated, IsRegieUser]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['post'])
    def register_source(self, request):
        device_id = request.data.get('device_id')
        name = (request.data.get('name') or 'Source video').strip()
        if not device_id:
            return Response({'error': 'device_id requis'}, status=status.HTTP_400_BAD_REQUEST)

        existing = Camera.objects.filter(device_id=device_id).first()
        if (
            existing
            and is_source_user(request.user)
            and existing.owner_id
            and existing.owner_id != request.user.id
        ):
            return Response(
                {'error': 'Cette source video appartient a un autre compte.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        camera, created = Camera.objects.update_or_create(
            device_id=device_id,
            defaults={
                'name': name[:100] or 'Source video',
                'owner': request.user,
                'is_active': True,
            },
        )
        serializer = self.get_serializer(camera)
        return Response(
            {'created': created, 'camera': serializer.data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'])
    def deactivate_source(self, request):
        device_id = request.data.get('device_id')
        if not device_id:
            return Response({'error': 'device_id requis'}, status=status.HTTP_400_BAD_REQUEST)

        queryset = Camera.objects.filter(device_id=device_id, is_active=True)
        if is_source_user(request.user):
            queryset = queryset.filter(owner=request.user)
        updated = queryset.update(is_active=False)
        if updated:
            notify_admin_live_sources_changed()
        return Response({'deactivated': updated})

    @action(detail=False, methods=['get'])
    def live(self, request):
        live_ids = get_live_camera_ids()
        cameras = Camera.objects.filter(id__in=live_ids, is_active=True).order_by('name', 'id')
        serializer = self.get_serializer(cameras, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def cleanup_session(self, request):
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({'error': 'session_id requis'}, status=status.HTTP_400_BAD_REQUEST)

        live_ids = get_live_camera_ids()
        stale = Camera.objects.filter(is_active=True).filter(
            Q(device_id=session_id) | Q(device_id__startswith=f'{session_id}__')
        )
        if is_source_user(request.user):
            stale = stale.filter(owner=request.user)
        stale = stale.exclude(id__in=live_ids)

        count = stale.update(is_active=False)
        if count:
            notify_admin_live_sources_changed()
        return Response({'deactivated': count})

    @action(detail=True, methods=['post'])
    def select_for_viewer(self, request, pk=None):
        camera = self.get_object()
        camera.is_active = True
        camera.save(update_fields=['is_active', 'updated_at'])

        Stream.objects.filter(is_selected=True).exclude(camera=camera).update(
            is_selected=False
        )

        stream, _ = Stream.objects.update_or_create(
            camera=camera,
            defaults={'is_active': True, 'is_selected': True, 'ended_at': None},
        )

        transition = request.data.get('transition', 'cut')
        try:
            duration_ms = int(request.data.get('duration_ms', 0))
        except (TypeError, ValueError):
            duration_ms = 0
        if transition == 'fade' and duration_ms <= 0:
            duration_ms = 500

        notify_viewers_selection(
            camera.id,
            camera.name,
            transition=transition,
            duration_ms=duration_ms,
        )

        return Response(
            {
                'status': 'live',
                'camera_id': camera.id,
                'camera_name': camera.name,
                'stream_id': stream.id,
                'transition': transition,
                'duration_ms': duration_ms,
            }
        )


class AudioSourceViewSet(viewsets.ModelViewSet):
    queryset = AudioSource.objects.all().order_by('name', 'id')
    serializer_class = AudioSourceSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if is_source_user(self.request.user):
            return queryset.filter(owner=self.request.user)
        return queryset

    def get_permissions(self):
        if self.action in {'register_source', 'deactivate_source', 'cleanup_session'}:
            permission_classes = [permissions.IsAuthenticated, IsSourceOrRegieUser]
        elif self.action in {'live', 'select_for_listener', 'list', 'retrieve'}:
            permission_classes = [permissions.IsAuthenticated, IsRegieUser]
        else:
            permission_classes = [permissions.IsAuthenticated, IsRegieUser]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['post'])
    def register_source(self, request):
        device_id = request.data.get('device_id')
        name = (request.data.get('name') or 'Source audio').strip()
        if not device_id:
            return Response({'error': 'device_id requis'}, status=status.HTTP_400_BAD_REQUEST)

        existing = AudioSource.objects.filter(device_id=device_id).first()
        if (
            existing
            and is_source_user(request.user)
            and existing.owner_id
            and existing.owner_id != request.user.id
        ):
            return Response(
                {'error': 'Cette source audio appartient a un autre compte.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        source, created = AudioSource.objects.update_or_create(
            device_id=device_id,
            defaults={
                'name': name[:100] or 'Source audio',
                'owner': request.user,
                'is_active': True,
            },
        )
        serializer = self.get_serializer(source)
        return Response(
            {'created': created, 'audio_source': serializer.data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'])
    def deactivate_source(self, request):
        device_id = request.data.get('device_id')
        if not device_id:
            return Response({'error': 'device_id requis'}, status=status.HTTP_400_BAD_REQUEST)

        queryset = AudioSource.objects.filter(device_id=device_id, is_active=True)
        if is_source_user(request.user):
            queryset = queryset.filter(owner=request.user)
        updated = queryset.update(is_active=False)
        if updated:
            notify_admin_live_sources_changed()
        return Response({'deactivated': updated})

    @action(detail=False, methods=['get'])
    def live(self, request):
        live_ids = get_live_audio_ids()
        sources = AudioSource.objects.filter(id__in=live_ids, is_active=True).order_by('name', 'id')
        serializer = self.get_serializer(sources, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def cleanup_session(self, request):
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({'error': 'session_id requis'}, status=status.HTTP_400_BAD_REQUEST)

        live_ids = get_live_audio_ids()
        stale = AudioSource.objects.filter(is_active=True).filter(
            Q(device_id=session_id) | Q(device_id__startswith=f'{session_id}__')
        )
        if is_source_user(request.user):
            stale = stale.filter(owner=request.user)
        stale = stale.exclude(id__in=live_ids)

        count = stale.update(is_active=False)
        if count:
            notify_admin_live_sources_changed()
        return Response({'deactivated': count})

    @action(detail=True, methods=['post'])
    def select_for_listener(self, request, pk=None):
        source = self.get_object()
        source.is_active = True
        source.save(update_fields=['is_active', 'updated_at'])

        AudioStream.objects.filter(is_selected=True).exclude(source=source).update(
            is_selected=False
        )

        stream, _ = AudioStream.objects.update_or_create(
            source=source,
            defaults={'is_active': True, 'is_selected': True, 'ended_at': None},
        )

        notify_viewers_audio_selection(source.id, source.name)

        return Response(
            {
                'status': 'live',
                'audio_source_id': source.id,
                'audio_source_name': source.name,
                'audio_stream_id': stream.id,
            }
        )


class StreamViewSet(viewsets.ModelViewSet):
    queryset = Stream.objects.select_related('camera').all().order_by('-started_at', '-id')
    serializer_class = StreamSerializer

    def get_permissions(self):
        if self.action == 'current_selected':
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated, IsRegieUser]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['get'])
    def current_selected(self, request):
        selected_stream = (
            Stream.objects.filter(is_selected=True, is_active=True)
            .select_related('camera')
            .first()
        )
        if selected_stream:
            return Response(
                {
                    'camera_id': selected_stream.camera.id,
                    'camera_name': selected_stream.camera.name,
                }
            )
        return Response({'status': 'none'})


class AudioStreamViewSet(viewsets.ModelViewSet):
    queryset = AudioStream.objects.select_related('source').all().order_by(
        '-started_at', '-id'
    )
    serializer_class = AudioStreamSerializer

    def get_permissions(self):
        if self.action == 'current_selected':
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated, IsRegieUser]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['get'])
    def current_selected(self, request):
        selected_stream = (
            AudioStream.objects.filter(is_selected=True, is_active=True)
            .select_related('source')
            .first()
        )
        if selected_stream:
            return Response(
                {
                    'audio_source_id': selected_stream.source.id,
                    'audio_source_name': selected_stream.source.name,
                }
            )
        return Response({'status': 'none'})
