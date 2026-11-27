window.lessonConfig = {
    url: 'https://gomakaqzkifrpuijreku.supabase.co',
    publishableKey: 'sb_publishable_QXmMBEmOmDNxCIA56ekxwQ_V6twUgoA'
};
window.lessonClient = window.supabase
    ? supabase.createClient(lessonConfig.url, lessonConfig.publishableKey)
    : null;
