from django.db import models


class Camera(models.Model):
    name = models.CharField(max_length=100)
    device_id = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Stream(models.Model):
    camera = models.ForeignKey(Camera, on_delete=models.CASCADE, related_name='streams')
    is_active = models.BooleanField(default=False)
    is_selected = models.BooleanField(default=False)  # Sélectionné par l'admin pour les viewers
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Stream de {self.camera.name}"


class Viewer(models.Model):
    session_id = models.CharField(max_length=100, unique=True)
    connected_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Viewer {self.session_id}"
