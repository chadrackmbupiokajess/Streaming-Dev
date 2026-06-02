from asgiref.sync import async_to_sync

from .consumers import broadcast_viewer_selection


def notify_viewers_selection(camera_id=None, camera_name=None):
    async_to_sync(broadcast_viewer_selection)(camera_id, camera_name)
