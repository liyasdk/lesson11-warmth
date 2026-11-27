(() => {
    const get = id => document.getElementById(id);
    const client = window.lessonClient;
    const login = get('login');
    const status = get('status');
    const dashboard = get('dashboard');
    const timestamp = value => value ? new Date(value).toLocaleString('zh-TW') : '—';
    const categories = { body: '身體感受', action: '關愛行動', participate: '一起參與', heart: '心裡感受', distractor: '其他句子' };
    let activeSeat = null;
    let detailOffset = 0;
    let detailRequest = 0;
    let authorized = false;
    let refreshing = false;

    if (!client) {
        status.textContent = '教師後台尚未設定 Supabase。';
        login.querySelector('button').disabled = true;
        return;
    }

    function append(parent, tag, value) {
        const el = document.createElement(tag);
        el.textContent = value;
        parent.append(el);
        return el;
    }

    async function details(seat, more = false) {
        activeSeat = seat;
        const request = ++detailRequest;
        const offset = more ? detailOffset : 0;
        const { data, error } = await client.from('lesson11_events').select('*')
            .eq('seat', seat).order('received_at', { ascending: false })
            .order('id', { ascending: false }).range(offset, offset + 39);
        if (!authorized || request !== detailRequest) return;
        if (error) { status.textContent = '明細讀取失敗，請再試一次。'; return; }
        get('detail-title').textContent = `座號 ${seat} 的作答明細`;
        const list = get('details');
        if (!more) list.replaceChildren();
        if (!data.length && !more) append(list, 'li', '尚無作答');
        for (const row of data) {
            const p = row.payload;
            const prefix = `${timestamp(row.received_at)}｜任務 ${row.task}`;
            let answer = '';
            if (row.kind === 'choice') {
                answer = `第 ${row.item} 題｜${p.correct ? '答對' : '答錯'}\n${p.question}\n作答：${p.answer}`;
            } else if (row.kind === 'classification') {
                const placements = Array.isArray(p.placements) ? p.placements : [];
                const lines = placements.filter(card => card && typeof card === 'object').map(card =>
                    `${card.text} → ${categories[card.category] || card.category}${card.category === card.expected ? ' ✓' : ' ✗'}`);
                answer = [`分類第 ${p.attempt} 次｜已答對 ${p.correct}/10 張｜本次錯 ${p.incorrect} 張`, ...lines].join('\n');
            } else {
                answer = `心得｜${p.answer}\n金幣：${p.coins} 枚`;
            }
            append(list, 'li', `${prefix}｜${answer}`);
        }
        detailOffset = offset + data.length;
        get('more').hidden = data.length < 40;
    }

    async function refresh() {
        if (!authorized || refreshing) return;
        refreshing = true;
        try {
            const { data, error } = await client.rpc('lesson11_overview');
            if (!authorized) return;
            if (error) throw error;
            const rows = get('rows');
            rows.replaceChildren();
            for (const student of data) {
                const tr = document.createElement('tr');
                const seat = append(append(tr, 'th', ''), 'button', student.seat);
                seat.type = 'button';
                seat.addEventListener('click', () => void details(student.seat));
                for (const task of [1, 2, 3]) {
                    const progress = student.tasks[String(task)];
                    let label = '未作答';
                    if (progress) {
                        const sections = [];
                        if (progress.total) sections.push(`選擇 ${progress.answered}/${progress.total}（對 ${progress.correct}）`);
                        if (progress.classified !== null) sections.push(`分類 ${progress.classified}/10`);
                        if (progress.reflection) sections.push('已寫心得');
                        label = sections.join(' · ');
                    }
                    append(tr, 'td', label);
                }
                append(tr, 'td', timestamp(student.last_answer));
                rows.append(tr);
            }
            const started = data.filter(row => row.last_answer).length;
            get('summary').textContent = `${started} / ${data.length} 人已作答`;
            status.textContent = `最後更新 ${timestamp(new Date())}（每 5 秒自動更新全班進度）`;
        } catch {
            status.textContent = '全班進度更新失敗，請檢查連線。';
        } finally {
            refreshing = false;
        }
    }

    async function authorize(user) {
        const { data, error } = await client.from('lesson11_teachers')
            .select('user_id').eq('user_id', user.id).maybeSingle();
        if (error) { status.textContent = '無法驗證教師權限，請確認後端設定。'; return; }
        if (!data) {
            await client.auth.signOut();
            status.textContent = '這個帳號沒有教師權限。';
            return;
        }
        authorized = true;
        get('login-panel').hidden = true;
        dashboard.hidden = false;
        await refresh();
    }

    login.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = login.querySelector('button');
        submit.disabled = true;
        try {
            const { data, error } = await client.auth.signInWithPassword({
                email: get('email').value.trim(), password: get('password').value
            });
            get('password').value = '';
            if (error) { status.textContent = '登入失敗，請確認帳號、密碼與網路連線。'; return; }
            await authorize(data.user);
        } finally { submit.disabled = false; }
    });
    get('logout').addEventListener('click', async () => {
        authorized = false;
        activeSeat = null;
        get('rows').replaceChildren();
        get('details').replaceChildren();
        get('detail-title').textContent = '作答明細';
        get('more').hidden = true;
        dashboard.hidden = true;
        get('login-panel').hidden = false;
        const { error } = await client.auth.signOut();
        status.textContent = error ? '登出失敗，請重新登入後再試。' : '已登出';
    });
    get('refresh').addEventListener('click', () => {
        void refresh();
        if (activeSeat !== null) void details(activeSeat);
    });
    get('more').addEventListener('click', () => void details(activeSeat, true));
    setInterval(refresh, 5000);
    client.auth.getSession().then(({ data }) => {
        if (data.session) void authorize(data.session.user);
    });
})();
