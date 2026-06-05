from rest_framework.permissions import BasePermission

from .auth_utils import is_regie_user, is_source_or_regie_user


class IsRegieUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and is_regie_user(request.user))


class IsSourceOrRegieUser(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and is_source_or_regie_user(request.user)
        )
