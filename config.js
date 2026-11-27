window.lessonConfig = {
    url: "https://YOUR_PROJECT_REF.supabase.co",
    publishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY"
};
window.lessonClient = window.supabase && !lessonConfig.url.includes("YOUR_PROJECT_REF")
    ? supabase.createClient(lessonConfig.url, lessonConfig.publishableKey)
    : null;
