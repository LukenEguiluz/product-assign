import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("inventory", "0003_catalogitem_uppercase_data"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="sessionscan",
            name="unique_rfid_per_session",
        ),
        migrations.AddField(
            model_name="sessionscan",
            name="excluded_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Excluido del inventario final",
            ),
        ),
        migrations.AddField(
            model_name="sessionscan",
            name="excluded_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="session_scans_excluded",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Excluido por",
            ),
        ),
    ]
