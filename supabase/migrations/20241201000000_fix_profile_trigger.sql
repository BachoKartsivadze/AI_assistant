-- Fix the create_profile_and_workspace trigger function to include all required fields
-- This fixes the issue where the trigger was failing due to missing columns

CREATE OR REPLACE FUNCTION create_profile_and_workspace() 
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    random_username TEXT;
BEGIN
    -- Generate a random username
    random_username := 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

    -- Create a profile for the new user with all required fields
    INSERT INTO public.profiles(
        user_id, 
        anthropic_api_key, 
        azure_openai_35_turbo_id, 
        azure_openai_45_turbo_id, 
        azure_openai_45_vision_id, 
        azure_openai_api_key, 
        azure_openai_endpoint, 
        azure_openai_embeddings_id,
        google_gemini_api_key, 
        groq_api_key,
        has_onboarded, 
        image_url, 
        image_path, 
        mistral_api_key, 
        display_name, 
        bio, 
        openai_api_key, 
        openai_organization_id, 
        openrouter_api_key,
        perplexity_api_key, 
        profile_context, 
        use_azure_openai, 
        username
    )
    VALUES(
        NEW.id,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        FALSE,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        FALSE,
        random_username
    );

    -- Create the home workspace for the new user
    INSERT INTO public.workspaces(
        user_id, 
        is_home, 
        name, 
        default_context_length, 
        default_model, 
        default_prompt, 
        default_temperature, 
        description, 
        embeddings_provider, 
        include_profile_context, 
        include_workspace_instructions, 
        instructions
    )
    VALUES(
        NEW.id,
        TRUE,
        'Home',
        4096,
        'gpt-4-turbo-preview',
        'You are a friendly, helpful AI assistant.',
        0.5,
        'My home workspace.',
        'openai',
        TRUE,
        TRUE,
        ''
    );

    RETURN NEW;
END;
$$;
