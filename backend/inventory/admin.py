from django.contrib import admin
from .models import Cabinet, CatalogItem, Client, InventorySession, SessionScan


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "client_number", "created_at")
    search_fields = ("name", "client_number")


@admin.register(Cabinet)
class CabinetAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "created_at")
    list_filter = ("client",)
    search_fields = ("name",)


@admin.register(CatalogItem)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ("gtin", "reference", "updated_at")
    search_fields = ("gtin", "reference", "description")


class SessionScanInline(admin.TabularInline):
    model = SessionScan
    extra = 0
    readonly_fields = ("created_at", "created_by")


@admin.register(InventorySession)
class InventorySessionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "delivery_number",
        "client",
        "cabinet",
        "inventory_date",
        "status",
        "created_by",
        "updated_at",
    )
    list_filter = ("status", "inventory_date")
    search_fields = ("delivery_number", "cabinet__name", "client__name")
    inlines = [SessionScanInline]
    readonly_fields = ("created_at", "updated_at", "completed_at")


# Ayuda para superusuario: el permiso está en inventory | ... | Puede crear usuarios...
# Se asigna en Admin > Usuarios > Permisos de usuario.
