import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
	await pool.query(
		'ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "activeOrganizationRole" text',
	);

	await pool.query(`
CREATE OR REPLACE FUNCTION sync_active_organization_role_from_member()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE "session"
       SET "activeOrganizationId" = NULL,
           "activeOrganizationRole" = NULL
     WHERE "userId" = OLD."userId"
       AND "activeOrganizationId" = OLD."organizationId";
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE "session"
       SET "activeOrganizationRole" = NEW.role
     WHERE "userId" = NEW."userId"
       AND "activeOrganizationId" = NEW."organizationId";
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION clear_active_organization_role_on_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "session"
     SET "activeOrganizationId" = NULL,
         "activeOrganizationRole" = NULL
   WHERE "activeOrganizationId" = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_active_organization_role_from_member
  ON "member";
CREATE TRIGGER sync_active_organization_role_from_member
AFTER UPDATE OF role OR DELETE ON "member"
FOR EACH ROW
EXECUTE FUNCTION sync_active_organization_role_from_member();

DROP TRIGGER IF EXISTS clear_active_organization_role_on_delete
  ON "organization";
CREATE TRIGGER clear_active_organization_role_on_delete
AFTER DELETE ON "organization"
FOR EACH ROW
EXECUTE FUNCTION clear_active_organization_role_on_delete();
`);
} finally {
	await pool.end();
}
