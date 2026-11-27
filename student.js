(() => {
    const client = window.lessonClient;
    const roster = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,21,23,24,25,26,27,28];
    const form = document.getElementById('join-class');
    const status = document.getElementById('class-status');
    const key = 'lesson11-student-v1';
    let student = null;
    let queue = [];
    let syncing = false;
    try {
        ({ student = null, queue = [] } = JSON.parse(sessionStorage.getItem(key) || '{}'));
    } catch { /* The page can still be used without storage. */ }
    const teacher = form.querySelector('a');
    const heading = document.createElement('p');
    heading.className = 'w-full font-bold';
    heading.textContent = '請點選自己的座號';
    const seats = document.createElement('div');
    seats.className = 'grid w-full grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-12';
    form.replaceChildren(heading, seats, teacher);
    const banner = document.createElement('small');
    banner.setAttribute('role', 'status');
    document.querySelector('nav').after(banner);

    function show(message) {
        status.textContent = banner.textContent = message;
    }
    function persist() {
        try { sessionStorage.setItem(key, JSON.stringify({ student, queue })); }
        catch { /* Pending answers remain in memory. */ }
    }
    function updateButtons() {
        for (const button of seats.children) {
            const selected = Number(button.dataset.seat) === student?.seat;
            button.setAttribute('aria-pressed', String(selected));
            button.classList.toggle('ring-4', selected);
            button.classList.toggle('ring-amber-400', selected);
            button.disabled = !client || syncing;
        }
    }
    async function sync() {
        if (!client || !student || syncing || !queue.length) return;
        syncing = true;
        updateButtons();
        try {
            while (queue.length) {
                const { error } = student.code
                    ? await client.rpc('lesson11_submit', { p_code: student.code, p_event: queue[0] })
                    : await client.rpc('lesson11_submit_seat', { p_seat: student.seat, p_event: queue[0] });
                if (error) throw error;
                queue.shift();
                persist();
            }
            const seat = student.seat;
            student = roster.includes(seat) ? { seat } : null;
            persist();
            show(student ? '座號 ' + seat + '｜作答已同步' : '先前作答已同步。請點選正確座號。');
        } catch {
            show('座號 ' + student.seat + '｜' + queue.length + ' 筆待同步，請保持此分頁開啟');
        } finally {
            syncing = false;
            updateButtons();
        }
    }
    for (const seat of roster) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.seat = seat;
        button.className = 'tap-btn min-h-12 rounded-xl bg-[#265675] p-2 font-bold text-white';
        button.textContent = seat;
        button.setAttribute('aria-label', '座號 ' + seat);
        button.addEventListener('click', () => {
            if (student?.seat === seat) return;
            if (queue.length) {
                show('請先等作答同步完成，再切換座號。');
                return;
            }
            const switching = student !== null;
            student = { seat };
            persist();
            if (switching) location.reload();
            else {
                updateButtons();
                show('座號 ' + seat + '｜可以開始答題');
            }
        });
        seats.append(button);
    }
    window.recordAnswer = (kind, task, item, payload) => {
        if (!client) return;
        if (!student || !roster.includes(student.seat)) {
            show('請回大廳點選自己的座號，再開始作答。');
            return;
        }
        queue.push({ id: crypto.randomUUID(), kind, task, item, payload });
        persist();
        void sync();
    };
    if (student && !queue.length) {
        student = roster.includes(student.seat) ? { seat: student.seat } : null;
        persist();
    }
    updateButtons();
    if (!client) show('目前為練習模式，教師同步尚未設定。');
    else if (student) {
        show('座號 ' + student.seat + '｜可以開始答題');
        void sync();
    } else show('請先點選座號，老師才會收到之後的作答。');
    addEventListener('online', sync);
    setInterval(sync, 5000);
})();
