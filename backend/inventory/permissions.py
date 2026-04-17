from rest_framework import permissions


class CanCreateAppUsers(permissions.BasePermission):
    """Solo usuarios con permiso explícito (asignado por superusuario en admin)."""

    def has_permission(self, request, view):
        return request.user and request.user.has_perm("inventory.can_create_app_users")


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)
