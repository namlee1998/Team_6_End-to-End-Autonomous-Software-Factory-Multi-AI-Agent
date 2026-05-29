-- 017_create_feature_backlogs.sql

DROP TABLE IF EXISTS public.feature_backlogs CASCADE;

CREATE TABLE IF NOT EXISTS public.feature_backlogs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'TODO', -- TODO, IN_PROGRESS, REVIEW, DONE
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.feature_backlogs ENABLE ROW LEVEL SECURITY;

-- Select
CREATE POLICY "Users can view backlogs of their projects"
    ON public.feature_backlogs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = feature_backlogs.project_id
            AND project_members.user_id = auth.uid()
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = feature_backlogs.project_id
            AND projects.created_by = auth.uid()
        )
    );

-- Insert
CREATE POLICY "Users can insert backlogs to their projects"
    ON public.feature_backlogs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = project_id
            AND project_members.user_id = auth.uid()
            AND project_members.role IN ('owner', 'admin', 'editor')
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = project_id
            AND projects.created_by = auth.uid()
        )
    );

-- Update
CREATE POLICY "Users can update backlogs of their projects"
    ON public.feature_backlogs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = feature_backlogs.project_id
            AND project_members.user_id = auth.uid()
            AND project_members.role IN ('owner', 'admin', 'editor')
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = feature_backlogs.project_id
            AND projects.created_by = auth.uid()
        )
    );

-- Delete
CREATE POLICY "Users can delete backlogs of their projects"
    ON public.feature_backlogs FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_members.project_id = feature_backlogs.project_id
            AND project_members.user_id = auth.uid()
            AND project_members.role IN ('admin', 'owner')
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = feature_backlogs.project_id
            AND projects.created_by = auth.uid()
        )
    );
