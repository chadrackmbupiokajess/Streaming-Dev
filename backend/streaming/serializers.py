from rest_framework import serializers
from .models import Camera, Stream, Viewer


class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = ['id', 'name', 'device_id', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class StreamSerializer(serializers.ModelSerializer):
    camera_name = serializers.CharField(source='camera.name', read_only=True)
    
    class Meta:
        model = Stream
        fields = ['id', 'camera', 'camera_name', 'is_active', 'is_selected', 'started_at', 'ended_at']
        read_only_fields = ['id', 'started_at', 'ended_at']


class ViewerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Viewer
        fields = ['id', 'session_id', 'connected_at', 'is_active']
        read_only_fields = ['id', 'connected_at']
