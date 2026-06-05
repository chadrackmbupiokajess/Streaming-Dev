from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers

from .auth_utils import generate_password
from .models import AudioSource, AudioStream, Camera, Stream, UserProfile, Viewer

User = get_user_model()


class CameraSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)

    class Meta:
        model = Camera
        fields = [
            'id',
            'name',
            'device_id',
            'owner_username',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AudioSourceSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)

    class Meta:
        model = AudioSource
        fields = [
            'id',
            'name',
            'device_id',
            'owner_username',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StreamSerializer(serializers.ModelSerializer):
    camera_name = serializers.CharField(source='camera.name', read_only=True)

    class Meta:
        model = Stream
        fields = [
            'id',
            'camera',
            'camera_name',
            'is_active',
            'is_selected',
            'started_at',
            'ended_at',
        ]
        read_only_fields = ['id', 'started_at', 'ended_at']


class AudioStreamSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source='source.name', read_only=True)

    class Meta:
        model = AudioStream
        fields = [
            'id',
            'source',
            'source_name',
            'is_active',
            'is_selected',
            'started_at',
            'ended_at',
        ]
        read_only_fields = ['id', 'started_at', 'ended_at']


class ViewerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Viewer
        fields = ['id', 'session_id', 'connected_at', 'is_active']
        read_only_fields = ['id', 'connected_at']


class AuthUserSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'display_name', 'role']

    def get_display_name(self, obj):
        return getattr(obj.profile, 'display_name', '') or obj.username


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            username=attrs.get('username'),
            password=attrs.get('password'),
        )
        if not user:
            raise serializers.ValidationError("Identifiants invalides.")
        if not user.is_active:
            raise serializers.ValidationError("Ce compte est desactive.")
        attrs['user'] = user
        return attrs


class BootstrapSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    display_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, trim_whitespace=False)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe deja.")
        return value


class SourceAccountSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'display_name', 'role', 'is_active', 'date_joined']

    def get_display_name(self, obj):
        return getattr(obj.profile, 'display_name', '') or obj.username


class SourceAccountCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    display_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    password = serializers.CharField(
        min_length=8,
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe deja.")
        return value

    def create(self, validated_data):
        raw_password = validated_data.get('password') or generate_password()
        user = User.objects.create_user(
            username=validated_data['username'],
            password=raw_password,
        )
        user.profile.role = UserProfile.ROLE_SOURCE
        user.profile.display_name = (
            validated_data.get('display_name') or validated_data['username']
        )
        user.profile.save(update_fields=['role', 'display_name'])
        return user, raw_password
