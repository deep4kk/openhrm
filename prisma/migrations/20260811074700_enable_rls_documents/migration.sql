-- Row-level security for the documents module.
--
-- Same contract as the earlier enable_rls migrations: the tenant-owned table
-- compares its orgId against the app.current_org_id session variable that
-- withOrgContext() sets per transaction. An unset variable yields NULL, the
-- comparison is NULL, and the row is withheld -- failing closed.
--
-- letter_templates and generated_letters were already covered by
-- 20260807181000_enable_rls_phase234, so only the new table is added here.
-- TENANT_MODELS in src/lib/db.ts is the companion list; the two are meant to
-- be reviewed together.

ALTER TABLE "letter_mail_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "letter_mail_drafts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "letter_mail_drafts";
CREATE POLICY tenant_isolation ON "letter_mail_drafts"
  USING ("orgId" = current_setting('app.current_org_id', true))
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true));
