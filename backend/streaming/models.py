from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

User = get_user_model()


class UserProfile(models.Model):
    ROLE_REGIE = 'regie'
    ROLE_SOURCE = 'source'

    ROLE_CHOICES = [
        (ROLE_REGIE, 'Regie'),
        (ROLE_SOURCE, 'Source'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default=ROLE_SOURCE,
    )
    display_name = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return self.display_name or self.user.username


@receiver(post_save, sender=User)
def ensure_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


class Camera(models.Model):
    name = models.CharField(max_length=100)
    device_id = models.CharField(max_length=100, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cameras',
    )
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class AudioSource(models.Model):
    name = models.CharField(max_length=100)
    device_id = models.CharField(max_length=100, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audio_sources',
    )
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Stream(models.Model):
    camera = models.ForeignKey(Camera, on_delete=models.CASCADE, related_name='streams')
    is_active = models.BooleanField(default=False)
    is_selected = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)


class AudioStream(models.Model):
    source = models.ForeignKey(
        AudioSource,
        on_delete=models.CASCADE,
        related_name='streams',
    )
    is_active = models.BooleanField(default=False)
    is_selected = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)


class Viewer(models.Model):
    session_id = models.CharField(max_length=100, unique=True)
    connected_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
