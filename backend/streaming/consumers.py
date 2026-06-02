import json
from collections import defaultdict

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import Stream

stream_connections = defaultdict(set)
stream_publishers = defaultdict(set)
viewer_control_connections = set()


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


async def broadcast_viewer_selection(camera_id=None, camera_name=None):
    """Push instantané à tous les spectateurs connectés (sans channel layer)."""
    payload = json.dumps(
        {
            'type': 'selection_changed',
            'camera_id': camera_id,
            'camera_name': camera_name,
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


class StreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.camera_id = self.scope['url_route']['kwargs']['camera_id']
        self.stream_group_name = f'stream_{self.camera_id}'
        stream_connections[self.stream_group_name].add(self)
        await self.accept()

    async def disconnect(self, close_code):
        stream_connections[self.stream_group_name].discard(self)
        stream_publishers[self.stream_group_name].discard(self)

    async def receive(self, text_data=None, bytes_data=None):
        stream_publishers[self.stream_group_name].add(self)
        if bytes_data:
            dead = []
            for consumer in list(stream_connections[self.stream_group_name]):
                if consumer is self:
                    continue
                try:
                    await consumer.send(bytes_data=bytes_data)
                except Exception:
                    dead.append(consumer)
            for consumer in dead:
                stream_connections[self.stream_group_name].discard(consumer)
        elif text_data:
            data = json.loads(text_data)
            dead = []
            payload = json.dumps(data)
            for consumer in list(stream_connections[self.stream_group_name]):
                if consumer is self:
                    continue
                try:
                    await consumer.send(text_data=payload)
                except Exception:
                    dead.append(consumer)
            for consumer in dead:
                stream_connections[self.stream_group_name].discard(consumer)


class AdminConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def disconnect(self, close_code):
        pass


class ViewerConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        viewer_control_connections.add(self)
        await self.accept()
        camera_id, camera_name = await get_current_selection()
        await self.send_selection(camera_id, camera_name)

    async def disconnect(self, close_code):
        viewer_control_connections.discard(self)

    async def send_selection(self, camera_id, camera_name):
        await self.send(
            text_data=json.dumps(
                {
                    'type': 'selection_changed',
                    'camera_id': camera_id,
                    'camera_name': camera_name,
                }
            )
        )
