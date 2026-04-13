import re
from django.conf import settings
from django.db import models


class Client(models.Model):
    name = models.CharField("Cliente", max_length=255)
    client_number = models.CharField("Número de cliente", max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        permissions = [
            ("can_create_app_users", "Puede crear usuarios de la aplicación"),
        ]

    def __str__(self):
        return f"{self.name} ({self.client_number})"


class Cabinet(models.Model):
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="cabinets", verbose_name="Cliente"
    )
    name = models.CharField("Gabinete", max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["client", "name"]
        unique_together = [["client", "name"]]

    def __str__(self):
        return f"{self.name} — {self.client}"


class CatalogItem(models.Model):
    gtin = models.CharField("GTIN / GUDID", max_length=32, unique=True, db_index=True)
    reference = models.CharField("Referencia", max_length=255)
    description = models.TextField("Descripción", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["reference"]

    def save(self, *args, **kwargs):
        self.gtin = (self.gtin or "").strip().upper()
        self.reference = (self.reference or "").strip().upper()
        self.description = (self.description or "").strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.gtin} → {self.reference}"


class InventorySession(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        IN_PROGRESS = "in_progress", "En progreso"
        COMPLETED = "completed", "Finalizada"

    client = models.ForeignKey(
        Client, on_delete=models.PROTECT, related_name="sessions", verbose_name="Cliente"
    )
    cabinet = models.ForeignKey(
        Cabinet,
        on_delete=models.PROTECT,
        related_name="sessions",
        verbose_name="Gabinete",
        null=True,
        blank=True,
    )
    delivery_number = models.CharField("DLV / Delivery", max_length=128)
    inventory_date = models.DateField("Fecha de inventario")
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="inventory_sessions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        loc = str(self.cabinet) if self.cabinet_id else self.client.name
        return f"{self.delivery_number} @ {loc} ({self.get_status_display()})"


class SessionScan(models.Model):
    session = models.ForeignKey(
        InventorySession, on_delete=models.CASCADE, related_name="scans"
    )
    gtin = models.CharField(max_length=32)
    rfid_hex = models.CharField(max_length=24)
    expiry_yymmdd = models.CharField(
        "Caducidad YYMMDD (AI 17)",
        max_length=6,
        blank=True,
        null=True,
    )
    batch_lot = models.CharField(
        "Lote (AI 10)",
        max_length=64,
        blank=True,
        default="",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="session_scans"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    excluded_at = models.DateTimeField(
        "Excluido del inventario final",
        null=True,
        blank=True,
        db_index=True,
    )
    excluded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="session_scans_excluded",
        null=True,
        blank=True,
        verbose_name="Excluido por",
    )

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        from django.core.exceptions import ValidationError

        h = (self.rfid_hex or "").strip().upper()
        if not re.fullmatch(r"[0-9A-F]{24}", h):
            raise ValidationError(
                {"rfid_hex": "El RFID debe ser hexadecimal de exactamente 24 caracteres."}
            )

    def save(self, *args, **kwargs):
        if self.gtin:
            self.gtin = self.gtin.strip().upper()
        if self.rfid_hex:
            self.rfid_hex = self.rfid_hex.strip().upper()
        super().save(*args, **kwargs)
