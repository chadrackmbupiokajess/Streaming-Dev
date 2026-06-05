from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import serialize_user
from .models import UserProfile
from .permissions import IsRegieUser
from .serializers import (
    AuthUserSerializer,
    BootstrapSerializer,
    LoginSerializer,
    SourceAccountCreateSerializer,
    SourceAccountSerializer,
)

User = get_user_model()


class BootstrapStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        has_regie_account = User.objects.filter(profile__role=UserProfile.ROLE_REGIE).exists()
        return Response(
            {
                'setup_required': not has_regie_account,
                'has_regie_account': has_regie_account,
            }
        )


class BootstrapView(APIView):
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        if User.objects.filter(profile__role=UserProfile.ROLE_REGIE).exists():
            return Response(
                {'error': 'La plateforme a deja un compte regie initial.'},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = BootstrapSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.create_user(
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password'],
        )
        user.profile.role = UserProfile.ROLE_REGIE
        user.profile.display_name = (
            serializer.validated_data.get('display_name') or user.username
        )
        user.profile.save(update_fields=['role', 'display_name'])

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {'token': token.key, 'user': serialize_user(user)},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'user': serialize_user(user)})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.auth:
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = AuthUserSerializer(request.user)
        return Response(serializer.data)


class SourceAccountView(APIView):
    permission_classes = [IsAuthenticated, IsRegieUser]

    def get(self, request):
        users = User.objects.filter(profile__role=UserProfile.ROLE_SOURCE).order_by(
            'profile__display_name',
            'username',
        )
        serializer = SourceAccountSerializer(users, many=True)
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request):
        serializer = SourceAccountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, raw_password = serializer.create(serializer.validated_data)
        return Response(
            {
                'account': SourceAccountSerializer(user).data,
                'generated_password': raw_password,
            },
            status=status.HTTP_201_CREATED,
        )
