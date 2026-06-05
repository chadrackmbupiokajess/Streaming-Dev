from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AudioSource, AudioStream, Camera, Stream, UserProfile

User = get_user_model()


class AuthenticatedApiTestCase(APITestCase):
    def setUp(self):
        self.regie_user = User.objects.create_user(
            username='regie-chief',
            password='UltraSecure123',
        )
        self.regie_user.profile.role = UserProfile.ROLE_REGIE
        self.regie_user.profile.display_name = 'Regie Chief'
        self.regie_user.profile.save(update_fields=['role', 'display_name'])

        self.source_user = User.objects.create_user(
            username='source-floor',
            password='UltraSecure123',
        )
        self.source_user.profile.role = UserProfile.ROLE_SOURCE
        self.source_user.profile.display_name = 'Source Floor'
        self.source_user.profile.save(update_fields=['role', 'display_name'])

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        return token


class AuthViewsTests(APITestCase):
    def test_bootstrap_status_requires_setup_without_regie_account(self):
        response = self.client.get(reverse('auth-bootstrap-status'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['setup_required'])

    def test_bootstrap_creates_first_regie_account_and_token(self):
        response = self.client.post(
            reverse('auth-bootstrap'),
            {
                'username': 'master-regie',
                'display_name': 'Master Regie',
                'password': 'UltraSecure123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='master-regie')
        self.assertEqual(user.profile.role, UserProfile.ROLE_REGIE)
        self.assertTrue(Token.objects.filter(user=user).exists())
        self.assertEqual(response.data['user']['role'], UserProfile.ROLE_REGIE)

    def test_login_returns_token_and_profile(self):
        user = User.objects.create_user(username='regie-login', password='UltraSecure123')
        user.profile.role = UserProfile.ROLE_REGIE
        user.profile.display_name = 'Regie Login'
        user.profile.save(update_fields=['role', 'display_name'])

        response = self.client.post(
            reverse('auth-login'),
            {'username': 'regie-login', 'password': 'UltraSecure123'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['display_name'], 'Regie Login')
        self.assertTrue(response.data['token'])


class CameraViewSetTests(AuthenticatedApiTestCase):
    def test_register_source_requires_authentication(self):
        response = self.client.post(
            reverse('camera-register-source'),
            {'device_id': 'session__device-a', 'name': 'Source A'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_source_can_register_then_update_existing_camera(self):
        self.authenticate(self.source_user)

        response = self.client.post(
            reverse('camera-register-source'),
            {'device_id': 'session__device-a', 'name': 'Source A'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['created'])
        camera = Camera.objects.get(device_id='session__device-a')
        self.assertEqual(camera.owner, self.source_user)
        self.assertTrue(camera.is_active)

        response = self.client.post(
            reverse('camera-register-source'),
            {'device_id': 'session__device-a', 'name': 'Source A v2'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        camera.refresh_from_db()
        self.assertEqual(camera.name, 'Source A v2')

    @patch('streaming.views.get_live_camera_ids')
    def test_live_requires_regie_and_returns_only_active_cameras_with_publishers(
        self,
        mock_live_ids,
    ):
        active = Camera.objects.create(
            name='Active',
            device_id='device-active',
            owner=self.source_user,
            is_active=True,
        )
        Camera.objects.create(
            name='Offline',
            device_id='device-offline',
            owner=self.source_user,
            is_active=True,
        )
        mock_live_ids.return_value = [active.id]

        self.authenticate(self.regie_user)
        response = self.client.get(reverse('camera-live'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['id'] for item in response.data], [active.id])


class AudioSourceViewSetTests(AuthenticatedApiTestCase):
    def test_source_can_register_audio_source(self):
        self.authenticate(self.source_user)

        response = self.client.post(
            reverse('audiosource-register-source'),
            {'device_id': 'session__audio__mic-a', 'name': 'Micro A'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        source = AudioSource.objects.get(device_id='session__audio__mic-a')
        self.assertEqual(source.owner, self.source_user)
        self.assertTrue(source.is_active)

    @patch('streaming.views.get_live_audio_ids')
    def test_live_requires_regie_and_returns_only_active_audio_sources_with_publishers(
        self,
        mock_live_ids,
    ):
        active = AudioSource.objects.create(
            name='Mic Live',
            device_id='mic-live',
            owner=self.source_user,
            is_active=True,
        )
        AudioSource.objects.create(
            name='Mic Off',
            device_id='mic-off',
            owner=self.source_user,
            is_active=True,
        )
        mock_live_ids.return_value = [active.id]

        self.authenticate(self.regie_user)
        response = self.client.get(reverse('audiosource-live'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['id'] for item in response.data], [active.id])


class StreamViewSetTests(APITestCase):
    def test_current_selected_returns_selected_stream(self):
        camera = Camera.objects.create(name='Program', device_id='device-program', is_active=True)
        Stream.objects.create(camera=camera, is_active=True, is_selected=True)

        response = self.client.get(reverse('stream-current-selected'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['camera_id'], camera.id)
        self.assertEqual(response.data['camera_name'], camera.name)


class AudioStreamViewSetTests(APITestCase):
    def test_current_selected_returns_selected_audio_stream(self):
        source = AudioSource.objects.create(name='Main Mic', device_id='mic-main', is_active=True)
        AudioStream.objects.create(source=source, is_active=True, is_selected=True)

        response = self.client.get(reverse('audiostream-current-selected'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['audio_source_id'], source.id)
        self.assertEqual(response.data['audio_source_name'], source.name)

    def test_current_selected_returns_none_when_no_audio_is_selected(self):
        response = self.client.get(reverse('audiostream-current-selected'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'none')


class SourceAccountManagementTests(AuthenticatedApiTestCase):
    def test_regie_can_create_source_accounts(self):
        self.authenticate(self.regie_user)

        response = self.client.post(
            reverse('auth-source-accounts'),
            {'username': 'guest-source', 'display_name': 'Guest Source'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='guest-source')
        self.assertEqual(user.profile.role, UserProfile.ROLE_SOURCE)
        self.assertTrue(response.data['generated_password'])
