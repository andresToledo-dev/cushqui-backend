-- Rename the enum value in place so existing integrations and their tokens keep working
ALTER TYPE "IntegrationType" RENAME VALUE 'SHORTCUT' TO 'NOTIFICATION';
