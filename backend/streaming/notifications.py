from asgiref.sync import async_to_sync

from .consumers import (
    broadcast_admin_event,
    broadcast_live_sources_changed,
    broadcast_viewer_audio_selection,
    broadcast_selection_update,
)


def notify_viewers_selection(
    camera_id=None,
    camera_name=None,
    transition='cut',
    duration_ms=0,
):
    async_to_sync(broadcast_selection_update)(
        camera_id, camera_name, transition, duration_ms
    )


def notify_viewers_audio_selection(audio_source_id=None, audio_source_name=None):
    async_to_sync(broadcast_admin_event)(
        'audio_selection_changed',
        audio_source_id=audio_source_id,
        audio_source_name=audio_source_name,
    )
    async_to_sync(broadcast_viewer_audio_selection)(
        audio_source_id, audio_source_name
    )


def notify_admin_live_sources_changed():
    async_to_sync(broadcast_live_sources_changed)()
