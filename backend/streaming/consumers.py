import json
import uuid
from collections import defaultdict
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from rest_framework.authtoken.models import Token

from .auth_utils import get_user_role
from .models import AudioStream, Stream

stream_connections = defaultdict(set)
stream_clients = defaultdict(dict)
stream_publishers = defaultdict(set)
audio_connections = defaultdict(set)
audio_publishers = defaultdict(set)
viewer_control_connections = set()
admin_control_connections = set()


def get_live_camera_ids():
    ids = []
    for group_name, publishers in stream_publishers.items():
        if not publishers or not group_name.startswith('stream_'):
            continue
        try:
            ids.append(int(group_name.replace('stream_', '', 1)))
        except ValueError:
            continue
    return ids


def get_live_audio_ids():
    ids = []
    for group_name, publishers in audio_publishers.items():
        if not publishers or not group_name.startswith('audio_'):
            continue
        try:
            ids.append(int(group_name.replace('audio_', '', 1)))
        except ValueError:
            continue
    return ids


async def broadcast_viewer_selection(
    camera_id=None,
    camera_name=None,
    transition='cut',
    duration_ms=0,
):
    """Push instantané à tous les spectateurs connectés (sans channel layer)."""
    payload = json.dumps(
        {
            'type': 'selection_changed',
            'camera_id': camera_id,
            'camera_name': camera_name,
            'transition': transition,
            'duration_ms': duration_ms,
        }
    )
    dead = []
    for consumer in list(viewer_control_connections):
        try:
            await consumer.send(text_data=payload)
        except Exception:
            dead.append(consumer)
    for consumer in dead:
        viewer_control_connections.discard(consumer)


async def broadcast_viewer_audio_selection(audio_source_id=None, audio_source_name=None):
    payload = json.dumps(
        {
            'type': 'audio_selection_changed',
            'audio_source_id': audio_source_id,
            'audio_source_name': audio_source_name,
        }
    )
    dead = []
    for consumer in list(viewer_control_connections):
        try:
            await consumer.send(text_data=payload)
        except Exception:
            dead.append(consumer)
    for consumer in dead:
        viewer_control_connections.discard(consumer)


async def broadcast_admin_event(event_type, **payload):
    message = json.dumps({'type': event_type, **payload})
    dead = []
    for consumer in list(admin_control_connections):
        try:
            await consumer.send(text_data=message)
        except Exception:
            dead.append(consumer)
    for consumer in dead:
        admin_control_connections.discard(consumer)


async def broadcast_selection_update(
    camera_id=None,
    camera_name=None,
    transition='cut',
    duration_ms=0,
):
    await broadcast_viewer_selection(
        camera_id=camera_id,
        camera_name=camera_name,
        transition=transition,
        duration_ms=duration_ms,
    )
    await broadcast_admin_event(
        'selection_changed',
        camera_id=camera_id,
        camera_name=camera_name,
        transition=transition,
        duration_ms=duration_ms,
    )


async def broadcast_live_sources_changed():
    await broadcast_admin_event('live_sources_changed')


async def relay_message(connections, group_name, sender, text_data=None, bytes_data=None):
    dead = []
    for consumer in list(connections[group_name]):
        if consumer is sender:
            continue
        try:
            if bytes_data is not None:
                await consumer.send(bytes_data=bytes_data)
            elif text_data is not None:
                await consumer.send(text_data=text_data)
        except Exception:
            dead.append(consumer)
    for consumer in dead:
        connections[group_name].discard(consumer)


async def send_to_stream_client(group_name, target_id, payload):
    target = stream_clients[group_name].get(target_id)
    if not target:
        return
    try:
        await target.send(text_data=json.dumps(payload))
    except Exception:
        stream_clients[group_name].pop(target_id, None)
        stream_connections[group_name].discard(target)


async def relay_to_stream_publishers(group_name, sender, payload):
    dead = []
    message = json.dumps(payload)
    for consumer in list(stream_publishers[group_name]):
        if consumer is sender:
            continue
        try:
            await consumer.send(text_data=message)
        except Exception:
            dead.append(consumer)
    for consumer in dead:
        stream_publishers[group_name].discard(consumer)
        stream_connections[group_name].discard(consumer)


async def relay_to_stream_group(group_name, sender, payload):
    message = json.dumps(payload)
    dead = []
    for consumer in list(stream_connections[group_name]):
        if consumer is sender:
            continue
        try:
            await consumer.send(text_data=message)
        except Exception:
            dead.append(consumer)
    for consumer in dead:
        stream_connections[group_name].discard(consumer)


@database_sync_to_async
def get_current_selection():
    stream = (
        Stream.objects.filter(is_selected=True, is_active=True)
        .select_related('camera')
        .first()
    )
    if stream:
        return stream.camera.id, stream.camera.name
    return None, None


@database_sync_to_async
def get_current_audio_selection():
    audio_stream = (
        AudioStream.objects.filter(is_selected=True, is_active=True)
        .select_related('source')
        .first()
    )
    if audio_stream:
        return audio_stream.source.id, audio_stream.source.name
    return None, None


@database_sync_to_async
def get_socket_identity(query_string):
    token_key = parse_qs(query_string.decode('utf-8')).get('token', [None])[0]
    if not token_key:
        return None

    token = (
        Token.objects.select_related('user', 'user__profile')
        .filter(key=token_key, user__is_active=True)
        .first()
    )
    if not token:
        return None

    return {
        'user_id': token.user_id,
        'username': token.user.username,
        'role': get_user_role(token.user),
    }


class StreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.camera_id = self.scope['url_route']['kwargs']['camera_id']
        self.stream_group_name = f'stream_{self.camera_id}'
        self.client_id = uuid.uuid4().hex
        self.identity = await get_socket_identity(self.scope.get('query_string', b''))
        self.can_publish = bool(
            self.identity and self.identity.get('role') in {'source', 'regie'}
        )
        stream_connections[self.stream_group_name].add(self)
        stream_clients[self.stream_group_name][self.client_id] = self
        await self.accept()
        await self.send(
            text_data=json.dumps(
                {
                    'type': 'webrtc_connected',
                    'client_id': self.client_id,
                    'can_publish': self.can_publish,
                }
            )
        )

    async def disconnect(self, close_code):
        stream_connections[self.stream_group_name].discard(self)
        stream_clients[self.stream_group_name].pop(self.client_id, None)
        was_publisher = self in stream_publishers[self.stream_group_name]
        stream_publishers[self.stream_group_name].discard(self)
        await relay_to_stream_group(
            self.stream_group_name,
            self,
            {
                'type': 'webrtc_peer_left',
                'peer_id': self.client_id,
                'was_publisher': was_publisher,
            },
        )
        if was_publisher and not stream_publishers[self.stream_group_name]:
            await broadcast_live_sources_changed()

    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            try:
                data = json.loads(text_data)
            except json.JSONDecodeError:
                return

            message_type = data.get('type')

            if message_type == 'webrtc_source_ready':
                if not self.can_publish:
                    return
                was_live = bool(stream_publishers[self.stream_group_name])
                stream_publishers[self.stream_group_name].add(self)
                if not was_live:
                    await broadcast_live_sources_changed()
                await relay_to_stream_group(
                    self.stream_group_name,
                    self,
                    {
                        'type': 'webrtc_source_ready',
                        'source_id': self.client_id,
                        'camera_id': self.camera_id,
                    },
                )
                return

            if message_type == 'webrtc_viewer_ready':
                await relay_to_stream_publishers(
                    self.stream_group_name,
                    self,
                    {
                        **data,
                        'type': 'webrtc_viewer_ready',
                        'viewer_id': self.client_id,
                        'sender_id': self.client_id,
                    },
                )
                return

            if message_type in {'webrtc_offer', 'webrtc_answer', 'webrtc_ice'}:
                target_id = data.get('target_id')
                if not target_id:
                    return
                await send_to_stream_client(
                    self.stream_group_name,
                    target_id,
                    {
                        **data,
                        'sender_id': self.client_id,
                    },
                )
                return

            # Legacy patch stream support. New clients use WebRTC, but this keeps
            # old tabs from crashing while everyone reloads.
            if not self.can_publish:
                return
            was_live = bool(stream_publishers[self.stream_group_name])
            stream_publishers[self.stream_group_name].add(self)
            if not was_live:
                await broadcast_live_sources_changed()
            await relay_message(
                stream_connections,
                self.stream_group_name,
                self,
                text_data=json.dumps(data),
            )
            return

        if not self.can_publish:
            return
        was_live = bool(stream_publishers[self.stream_group_name])
        stream_publishers[self.stream_group_name].add(self)
        if not was_live:
            await broadcast_live_sources_changed()
        if bytes_data:
            await relay_message(
                stream_connections,
                self.stream_group_name,
                self,
                bytes_data=bytes_data,
            )


class AudioConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.camera_id = self.scope['url_route']['kwargs']['camera_id']
        self.audio_group_name = f'audio_{self.camera_id}'
        self.identity = await get_socket_identity(self.scope.get('query_string', b''))
        self.can_publish = bool(
            self.identity and self.identity.get('role') in {'source', 'regie'}
        )
        audio_connections[self.audio_group_name].add(self)
        await self.accept()

    async def disconnect(self, close_code):
        audio_connections[self.audio_group_name].discard(self)
        was_publisher = self in audio_publishers[self.audio_group_name]
        audio_publishers[self.audio_group_name].discard(self)
        if was_publisher and not audio_publishers[self.audio_group_name]:
            await broadcast_live_sources_changed()

    async def receive(self, text_data=None, bytes_data=None):
        if not self.can_publish:
            return
        was_live = bool(audio_publishers[self.audio_group_name])
        audio_publishers[self.audio_group_name].add(self)
        if not was_live:
            await broadcast_live_sources_changed()
        if bytes_data is not None:
            await relay_message(
                audio_connections,
                self.audio_group_name,
                self,
                bytes_data=bytes_data,
            )
        elif text_data is not None:
            await relay_message(
                audio_connections,
                self.audio_group_name,
                self,
                text_data=text_data,
            )


class AdminConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        identity = await get_socket_identity(self.scope.get('query_string', b''))
        if not identity or identity.get('role') != 'regie':
            await self.close(code=4403)
            return
        admin_control_connections.add(self)
        await self.accept()

    async def disconnect(self, close_code):
        admin_control_connections.discard(self)


class ViewerConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        viewer_control_connections.add(self)
        await self.accept()
        camera_id, camera_name = await get_current_selection()
        await self.send_selection(camera_id, camera_name, 'cut', 0)
        audio_source_id, audio_source_name = await get_current_audio_selection()
        await self.send_audio_selection(audio_source_id, audio_source_name)

    async def disconnect(self, close_code):
        viewer_control_connections.discard(self)

    async def send_selection(self, camera_id, camera_name, transition='cut', duration_ms=0):
        await self.send(
            text_data=json.dumps(
                {
                    'type': 'selection_changed',
                    'camera_id': camera_id,
                    'camera_name': camera_name,
                    'transition': transition,
                    'duration_ms': duration_ms,
                }
            )
        )

    async def send_audio_selection(self, audio_source_id, audio_source_name):
        await self.send(
            text_data=json.dumps(
                {
                    'type': 'audio_selection_changed',
                    'audio_source_id': audio_source_id,
                    'audio_source_name': audio_source_name,
                }
            )
        )
