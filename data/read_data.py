import pandas as pd
import rasterio

# JMARS-Export einlesen.
# Kommentarzeilen vorher auch auf relevante Metadaten prüfen.
table = pd.read_csv("jmars_export.csv", comment="#")

print("Spalten:", table.columns.tolist())
print(table.head())
print(table.dtypes)

# Georeferenziertes Höhenmodell einlesen.
with rasterio.open("elevation.tif") as src:
    elevation = src.read(1, masked=True)

    print("Koordinatensystem:", src.crs)
    print("Pixelgröße in CRS-Einheiten:", src.res)
    print("Ausdehnung:", src.bounds)
    print("NoData:", src.nodata)
    print("Rastertransformation:", src.transform)