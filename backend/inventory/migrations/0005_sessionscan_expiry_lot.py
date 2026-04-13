from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0004_sessionscan_soft_exclude"),
    ]

    operations = [
        migrations.AddField(
            model_name="sessionscan",
            name="batch_lot",
            field=models.CharField(
                blank=True,
                default="",
                max_length=64,
                verbose_name="Lote (AI 10)",
            ),
        ),
        migrations.AddField(
            model_name="sessionscan",
            name="expiry_yymmdd",
            field=models.CharField(
                blank=True,
                max_length=6,
                null=True,
                verbose_name="Caducidad YYMMDD (AI 17)",
            ),
        ),
    ]
