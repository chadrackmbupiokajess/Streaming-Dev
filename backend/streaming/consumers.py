import json
from channels.generic.websocket import AsyncWebsocketConsumer

class StreamConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.camera_id = self.scope['url_route']['kwargs']['camera_id']
        self.stream_group_name = f'stream_{self.camera_id}'
        await self.channel_layer.group_add(self.stream_group_name, self.channel_name)
        await self.accept()
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.stream_group_name, self.channel_name)
    
    async def receive(self, text_data=None, bytes_data=None):
        # On relaie soit du texte (Base64) soit des bytes (Blob)
        if bytes_data:
            await self.channel_layer.group_send(
                self.stream_group_name,
                {
                    'type': 'stream_bytes',
                    'data': bytes_data
                }
            )
        elif text_data:
            data = json.loads(text_data)
            await self.channel_layer.group_send(
                self.stream_group_name,
                {
                    'type': 'stream_text',
                    'data': data
                }
            )
    
    async def stream_bytes(self, event):
        # Envoi binaire ultra-rapide
        await self.send(bytes_data=event['data'])

    async def stream_text(self, event):
        await self.send(text_data=json.dumps(event['data']))


class AdminConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.admin_group_name = 'admin_streams'
        await self.channel_layer.group_add(self.admin_group_name, self.channel_name)
        await self.accept()
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.admin_group_name, self.channel_name)


class ViewerConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.viewer_group_name = 'viewers'
        await self.channel_layer.group_add(self.viewer_group_name, self.channel_name)
        await self.accept()
    
    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.viewer_group_name, self.channel_name)
