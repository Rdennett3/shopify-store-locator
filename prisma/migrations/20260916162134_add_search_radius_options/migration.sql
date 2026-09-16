-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "mapboxToken" TEXT,
    "defaultLatitude" REAL,
    "defaultLongitude" REAL,
    "defaultZoom" REAL NOT NULL DEFAULT 8,
    "searchRadius" INTEGER,
    "searchRadiusOptions" TEXT DEFAULT '25,50,100,250',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StoreSettings" ("createdAt", "defaultLatitude", "defaultLongitude", "defaultZoom", "id", "mapboxToken", "searchRadius", "shop", "updatedAt") SELECT "createdAt", "defaultLatitude", "defaultLongitude", "defaultZoom", "id", "mapboxToken", "searchRadius", "shop", "updatedAt" FROM "StoreSettings";
DROP TABLE "StoreSettings";
ALTER TABLE "new_StoreSettings" RENAME TO "StoreSettings";
CREATE UNIQUE INDEX "StoreSettings_shop_key" ON "StoreSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
