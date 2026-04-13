from django.db import migrations


def uppercase_catalog(apps, schema_editor):
    CatalogItem = apps.get_model("inventory", "CatalogItem")
    for row in CatalogItem.objects.all().iterator():
        row.gtin = (row.gtin or "").strip().upper()
        row.reference = (row.reference or "").strip().upper()
        row.description = (row.description or "").strip().upper()
        row.save(update_fields=["gtin", "reference", "description"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0002_inventorysession_cabinet_optional"),
    ]

    operations = [
        migrations.RunPython(uppercase_catalog, noop_reverse),
    ]
