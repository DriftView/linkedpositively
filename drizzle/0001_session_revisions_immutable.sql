-- Peer Navigation session revisions are history: every Save inserts a new row
-- and existing rows are never changed (the Mongoose model enforced this with
-- pre-update hooks). Deletes stay allowed (cascades from the session/user), and
-- so does the FK action that clears coach_id when the coach's account is deleted.
CREATE OR REPLACE FUNCTION "peer_nav_session_revisions_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.coach_id IS NULL AND (to_jsonb(NEW) - 'coach_id') = (to_jsonb(OLD) - 'coach_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Session revisions are immutable.';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "peer_nav_session_revisions_no_update"
  BEFORE UPDATE ON "peer_nav_session_revisions"
  FOR EACH ROW EXECUTE FUNCTION "peer_nav_session_revisions_immutable"();
