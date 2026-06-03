CREATE TABLE ancestors (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name       text NOT NULL,
    color      text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, name)
);

ALTER TABLE ancestors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ancestors_user_policy" ON ancestors
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE ancestor_annotations
    ADD COLUMN ancestor_id uuid REFERENCES ancestors(id) ON DELETE CASCADE;
