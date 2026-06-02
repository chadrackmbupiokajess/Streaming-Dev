from django.contrib import admin
from .models import Camera, Stream, Viewer


@admin.register(Camera)
class CameraAdmin(admin.ModelAdmin):
    list_display = ('name', 'device_id', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'device_id')


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ('camera', 'is_active', 'is_selected', 'started_at', 'ended_at')
    list_filter = ('is_active', 'is_selected')


@admin.register(Viewer)
class ViewerAdmin(admin.ModelAdmin):
    list_display = ('session_id', 'is_active', 'connected_at')
    list_filter = ('is_active',)
