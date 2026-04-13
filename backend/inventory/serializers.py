import re
from django.contrib.auth.models import User
from django.db import IntegrityError
from rest_framework import serializers

from .models import Cabinet, CatalogItem, Client, InventorySession, SessionScan


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "email", "is_active")
        read_only_fields = fields


class CreateAppUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("username", "password", "email", "first_name", "last_name", "is_active")

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ("id", "name", "client_number", "created_at")
        read_only_fields = ("created_at",)


class CabinetSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model = Cabinet
        fields = ("id", "client", "client_name", "name", "created_at")
        read_only_fields = ("created_at", "client_name")


class CatalogItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogItem
        fields = (
            "id",
            "gtin",
            "reference",
            "description",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate(self, attrs):
        for key in ("gtin", "reference", "description"):
            if key in attrs and attrs[key] is not None:
                attrs[key] = str(attrs[key]).strip().upper()
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("gtin", None)
        return super().update(instance, validated_data)


class SessionScanSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True
    )
    excluded_by_username = serializers.CharField(
        source="excluded_by.username", read_only=True, allow_null=True
    )
    is_excluded = serializers.SerializerMethodField()
    reference = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = SessionScan
        fields = (
            "id",
            "session",
            "gtin",
            "rfid_hex",
            "expiry_yymmdd",
            "batch_lot",
            "reference",
            "description",
            "created_by",
            "created_by_username",
            "created_at",
            "excluded_at",
            "excluded_by",
            "excluded_by_username",
            "is_excluded",
        )
        read_only_fields = (
            "created_by",
            "created_by_username",
            "created_at",
            "excluded_at",
            "excluded_by",
            "excluded_by_username",
            "is_excluded",
            "reference",
            "description",
        )

    def get_is_excluded(self, obj):
        return obj.excluded_at is not None

    def _catalog_pair(self, obj):
        """(reference, description) desde catálogo por GTIN; usa contexto batch si existe."""
        cache = self.context.setdefault("_scan_catalog_pair_by_pk", {})
        if obj.pk in cache:
            return cache[obj.pk]
        batch = self.context.get("catalog_by_gtin")
        if batch is not None:
            pair = batch.get(obj.gtin, ("", ""))
        else:
            ci = (
                CatalogItem.objects.filter(gtin=obj.gtin)
                .only("reference", "description")
                .first()
            )
            pair = (ci.reference, ci.description) if ci else ("", "")
        cache[obj.pk] = pair
        return pair

    def get_reference(self, obj):
        return self._catalog_pair(obj)[0]

    def get_description(self, obj):
        return self._catalog_pair(obj)[1]

    def validate_rfid_hex(self, value):
        v = (value or "").strip().upper()
        if not re.fullmatch(r"[0-9A-F]{24}", v):
            raise serializers.ValidationError(
                "El RFID debe ser hexadecimal de exactamente 24 caracteres."
            )
        return v


class InventorySessionSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    cabinet_name = serializers.SerializerMethodField()
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True
    )
    scan_count = serializers.SerializerMethodField()

    def get_cabinet_name(self, obj):
        return obj.cabinet.name if obj.cabinet_id else None

    def get_scan_count(self, obj):
        if hasattr(obj, "_active_scan_count"):
            return obj._active_scan_count
        if hasattr(obj, "_scan_count"):
            return obj._scan_count
        return obj.scans.filter(excluded_at__isnull=True).count()

    def validate(self, attrs):
        client = attrs.get("client") or getattr(self.instance, "client", None)
        cabinet = attrs.get("cabinet", serializers.empty)
        if cabinet is serializers.empty:
            cabinet = getattr(self.instance, "cabinet", None)
        if client and cabinet is not None and cabinet.client_id != client.id:
            raise serializers.ValidationError(
                {"cabinet": "El gabinete seleccionado no pertenece al cliente indicado."}
            )
        return attrs

    class Meta:
        model = InventorySession
        fields = (
            "id",
            "client",
            "client_name",
            "cabinet",
            "cabinet_name",
            "delivery_number",
            "inventory_date",
            "status",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
            "completed_at",
            "scan_count",
        )
        read_only_fields = (
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
            "completed_at",
            "client_name",
            "cabinet_name",
            "scan_count",
        )
        extra_kwargs = {
            "cabinet": {"required": False, "allow_null": True},
        }


class InventorySessionDetailSerializer(InventorySessionSerializer):
    scans = SessionScanSerializer(many=True, read_only=True)

    class Meta(InventorySessionSerializer.Meta):
        fields = InventorySessionSerializer.Meta.fields + ("scans",)

    def to_representation(self, instance):
        scans = getattr(instance, "_prefetched_objects_cache", {}).get("scans")
        if scans is None:
            scans = list(instance.scans.all())
        gtins = {s.gtin for s in scans if s.gtin}
        catalog_by_gtin = {}
        if gtins:
            for ci in CatalogItem.objects.filter(gtin__in=gtins).only(
                "gtin", "reference", "description"
            ):
                catalog_by_gtin[ci.gtin] = (ci.reference, ci.description)
        self.context["catalog_by_gtin"] = catalog_by_gtin
        return super().to_representation(instance)


def _clean_expiry_yymmdd(value):
    if value is None or value == "":
        return None
    v = str(value).strip()
    if not v:
        return None
    if not re.fullmatch(r"\d{6}", v):
        raise serializers.ValidationError(
            "La caducidad (AI 17) debe tener exactamente 6 dígitos AAMMDD."
        )
    return v


def _clean_batch_lot(value):
    if value is None:
        return ""
    return str(value).strip()[:64]


class SessionScanUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionScan
        fields = ("gtin", "rfid_hex", "expiry_yymmdd", "batch_lot")

    def validate_gtin(self, value):
        return (value or "").strip().upper()

    def validate_expiry_yymmdd(self, value):
        return _clean_expiry_yymmdd(value)

    def validate_batch_lot(self, value):
        return _clean_batch_lot(value)

    def validate_rfid_hex(self, value):
        v = (value or "").strip().upper()
        if not re.fullmatch(r"[0-9A-F]{24}", v):
            raise serializers.ValidationError(
                "El RFID debe ser hexadecimal de exactamente 24 caracteres."
            )
        return v

    def validate(self, attrs):
        instance = self.instance
        rfid = attrs.get("rfid_hex", instance.rfid_hex)
        if rfid:
            rfid = rfid.strip().upper()
        dup = (
            SessionScan.objects.filter(
                session=instance.session,
                excluded_at__isnull=True,
                rfid_hex=rfid,
            )
            .exclude(pk=instance.pk)
            .exists()
        )
        if dup:
            raise serializers.ValidationError(
                {
                    "rfid_hex": "Otro registro activo de esta lectura ya usa este RFID.",
                }
            )
        return attrs


class AddScanSerializer(serializers.Serializer):
    gtin = serializers.CharField(max_length=64)
    rfid_hex = serializers.CharField(max_length=64)
    expiry_yymmdd = serializers.CharField(
        max_length=6, required=False, allow_blank=True, allow_null=True
    )
    batch_lot = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )

    def validate_gtin(self, value):
        return (value or "").strip().upper()

    def validate_expiry_yymmdd(self, value):
        return _clean_expiry_yymmdd(value)

    def validate_batch_lot(self, value):
        return _clean_batch_lot(value)

    def validate_rfid_hex(self, value):
        v = (value or "").strip().upper()
        if not re.fullmatch(r"[0-9A-F]{24}", v):
            raise serializers.ValidationError(
                "El RFID debe ser hexadecimal de exactamente 24 caracteres."
            )
        return v

    def create(self, validated_data):
        session = self.context["session"]
        user = self.context["request"].user
        rfid = validated_data["rfid_hex"]
        if SessionScan.objects.filter(
            session=session, rfid_hex=rfid, excluded_at__isnull=True
        ).exists():
            raise serializers.ValidationError(
                {
                    "rfid_hex": "Este RFID ya está registrado en esta lectura. Revise o vuelva a escanear."
                }
            )
        try:
            return SessionScan.objects.create(
                session=session,
                gtin=validated_data["gtin"],
                rfid_hex=rfid,
                created_by=user,
                expiry_yymmdd=validated_data.get("expiry_yymmdd"),
                batch_lot=validated_data.get("batch_lot") or "",
            )
        except IntegrityError:
            raise serializers.ValidationError(
                {
                    "rfid_hex": "No se pudo guardar el registro (¿duplicado?). Revise los datos."
                }
            )
