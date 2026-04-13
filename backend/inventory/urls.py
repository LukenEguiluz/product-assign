from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register(r"clients", views.ClientViewSet, basename="client")
router.register(r"cabinets", views.CabinetViewSet, basename="cabinet")
router.register(r"catalog", views.CatalogItemViewSet, basename="catalog")
router.register(r"sessions", views.InventorySessionViewSet, basename="session")

urlpatterns = [
    path(
        "sessions/<int:session_pk>/scans/<int:pk>/restore/",
        views.SessionScanRestoreView.as_view(),
        name="session_scan_restore",
    ),
    path(
        "sessions/<int:session_pk>/scans/<int:pk>/",
        views.SessionScanDetailView.as_view(),
        name="session_scan_detail",
    ),
    path("auth/login/", views.LoginView.as_view(), name="token_obtain"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", views.MeView.as_view(), name="auth_me"),
    path("auth/users/", views.CreateAppUserView.as_view(), name="create_app_user"),
    path("auth/users/list/", views.UserListView.as_view(), name="list_app_users"),
    path("catalog/lookup/<str:gtin>/", views.CatalogLookupView.as_view(), name="catalog_lookup"),
    path("", include(router.urls)),
]
