from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="inventorysession",
            name="cabinet",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="sessions",
                to="inventory.cabinet",
                verbose_name="Gabinete",
            ),
        ),
    ]
