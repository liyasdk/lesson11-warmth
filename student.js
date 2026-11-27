(() => {
    const client = window.lessonClient;
    const form = document.getElementById('join-class');
    const input = document.getElementById('class-code');
    const status = document.getElementById('class-status');
    const submit = form.querySelector('button');
    const key = 'lesson11-student-v1';
    let student = null;
    let queue = [];
    let syncing = false;

    try {
        ({ student = null, queue = [] } = JSON.parse(sessionStorage.getItem(key) || '{}'));
    } catch { /* A new session can still join. */ }

    function persist() {
        try { sessionStorage.setItem(key, JSON.stringify({ student, queue })); }
        catch { /* Keep pending answers in memory for this page. */ }
    }

    function show(message) {
        status.textContent = message;
        let banner = document.getElementById('student-sync');
        if (!banner) {
            banner = document.createElement('small');
            banner.id = 'student-sync';
            banner.setAttribute('role', 'status');
            document.querySelector('nav').after(banner);
        }
        banner.textContent = message;
    }

    async function sync() {
        if (!client || !student || syncing) return;
        syncing = true;
        submit.disabled = true;
        try {
            while (queue.length) {
                const { error } = await client.rpc('lesson11_submit', {
                    p_code: student.code, p_event: queue[0]
                });
                if (error) throw error;
                queue.shift();
                persist();
            }
            show(`座號 ${student.seat}｜作答已同步`);
        } catch {
            show(`座號 ${student.seat}｜${queue.length} 筆待同步，請保持此分頁開啟`);
        } finally {
            syncing = false;
            submit.disabled = false;
        }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!client || syncing) return;
        if (queue.length) {
            show('請先等目前的作答同步，再更換作答碼。');
            return;
        }
        const code = input.value.trim().toUpperCase();
        submit.disabled = true;
        try {
            const { data, error } = await client.rpc('lesson11_join', { p_code: code });
            if (error) throw error;
            if (student && student.code !== code) {
                student = { code, seat: data };
                persist();
                location.reload();
                return;
            }
            student = { code, seat: data };
            persist();
            input.value = '';
            show(`座號 ${data}｜已加入課堂`);
        } catch {
            show('加入失敗，請檢查作答碼和網路連線。');
        } finally {
            submit.disabled = false;
        }
    });

    window.recordAnswer = (kind, task, item, payload) => {
        if (!student) {
            if (client) show('尚未加入課堂。請回大廳輸入作答碼，先前的作答不會上傳。');
            return;
        }
        queue.push({ id: crypto.randomUUID(), kind, task, item, payload });
        persist();
        show(`座號 ${student.seat}｜正在同步 ${queue.length} 筆作答`);
        void sync();
    };
    if (!client) show('目前為練習模式，教師同步尚未設定。');
    else if (student) void sync();

    addEventListener('online', sync);
    setInterval(() => { if (queue.length) void sync(); }, 5000);
})();
